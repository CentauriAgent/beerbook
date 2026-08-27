import { useEffect, useRef, useState } from 'react';
import { ArrowUp, MessageCircle, Send, X } from 'lucide-react';
import { LoginArea } from '@/components/auth/LoginArea';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { COMMENTS_PAGE, useAddComment, useComments } from '@/hooks/useComments';
import { timeAgo, type BeerComment, type CheckInRef, type CommentParent } from '@/lib/comments';
import { cn } from '@/lib/utils';

/** Dark translucent pill used by the reader's overlay controls. */
const PILL =
  'flex items-center gap-1.5 rounded-full bg-black/45 text-white backdrop-blur-sm transition active:scale-95';

/**
 * Comments on a check-in — NIP-22 kind 1111 replies.
 *
 * UI decisions:
 * - Entry: a compact pill (MessageCircle + count) in the bottom overlay's
 *   author row. 44px tall so it never fights the full-bleed photo and sits
 *   with the other overlay controls, away from the horizontal drag edges.
 * - Sheet: in-page bottom sheet (not vaul) so we fully control gesture
 *   isolation — it only exists while open, and it stops pointer events
 *   from reaching the page-turn engine underneath.
 */
export function Comments({ checkIn }: { checkIn: CheckInRef }) {
  const [open, setOpen] = useState(false);
  // Eager query (like useCheers) so the pill always shows a live count.
  const { data: comments } = useComments(checkIn.id);

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        aria-label={`Comments (${comments?.length ?? 0})`}
        className={cn(PILL, 'h-11 px-3.5 text-sm font-semibold')}
      >
        <MessageCircle size={20} />
        <span>{comments?.length ?? 0}</span>
      </button>

      {open && (
        <CommentsSheet
          checkIn={checkIn}
          comments={comments}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function CommentsSheet({
  checkIn,
  comments,
  onClose,
}: {
  checkIn: CheckInRef;
  comments: BeerComment[] | undefined;
  onClose: () => void;
}) {
  const [visible, setVisible] = useState(COMMENTS_PAGE);
  const [replyTo, setReplyTo] = useState<CommentParent | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [replyTo]);

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col justify-end"
      style={{ touchAction: 'pan-y' }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="Comments"
    >
      {/* Dismiss backdrop */}
      <button
        type="button"
        aria-label="Close comments"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />

      {/* Bottom panel */}
      <div className="relative flex max-h-[70%] flex-col rounded-t-2xl border-t border-amber-400/25 bg-stone-900/95 shadow-2xl backdrop-blur-md animate-in">
        <header className="flex items-center justify-between px-4 pb-2 pt-3">
          <h3 className="text-sm font-bold text-amber-100">
            Comments{comments?.length ? ` · ${comments.length}` : ''}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-full text-amber-100/80 transition active:scale-90"
          >
            <X size={22} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-4 pb-2">
          {comments === undefined && (
            <p className="py-6 text-center text-sm text-amber-100/50">Loading…</p>
          )}
          {comments?.length === 0 && (
            <p className="py-6 text-center text-sm text-amber-100/50">
              No comments yet. Start the conversation 🍻
            </p>
          )}
          {comments?.slice(0, visible).map((c) => (
            <CommentRow
              key={c.id}
              comment={c}
              isReply={c.parentId !== checkIn.id}
              onReply={() => setReplyTo({ id: c.id, pubkey: c.pubkey, kind: 1111 })}
            />
          ))}
          {comments && comments.length > visible && (
            <button
              type="button"
              onClick={() => setVisible((v) => v + COMMENTS_PAGE)}
              className="my-1 flex h-11 w-full items-center justify-center gap-1 text-sm font-semibold text-amber-300"
            >
              Show more ({comments.length - visible}) <ArrowUp size={16} />
            </button>
          )}
        </div>

        <ComposerRow checkIn={checkIn} replyTo={replyTo} onClearReply={() => setReplyTo(undefined)} inputRef={inputRef} />
      </div>
    </div>
  );
}

function CommentRow({
  comment,
  isReply,
  onReply,
}: {
  comment: BeerComment;
  isReply: boolean;
  onReply: () => void;
}) {
  const { data: author } = useAuthor(comment.pubkey);
  const name = author?.metadata?.display_name || author?.metadata?.name || `${comment.pubkey.slice(0, 8)}…`;
  const picture = author?.metadata?.picture;

  return (
    <div className={cn('flex gap-2.5 rounded-2xl px-1 py-1.5', isReply && 'ml-6')}>
      {picture ? (
        <img src={picture} alt="" className="mt-0.5 h-7 w-7 shrink-0 rounded-full border border-amber-400/40 object-cover" />
      ) : (
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-amber-400/40 bg-amber-800 text-[10px]">🍺</div>
      )}
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2">
          <span className="truncate text-xs font-semibold text-amber-100">{name}</span>
          <span className="shrink-0 text-[10px] text-amber-100/50">{timeAgo(comment.createdAt)}</span>
        </p>
        <p className="whitespace-pre-wrap break-words text-sm leading-snug text-amber-50/90">
          {comment.content}
        </p>
      </div>
      <button
        type="button"
        onClick={onReply}
        aria-label={`Reply to ${name}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-amber-100/60 transition active:scale-90"
      >
        <Send size={15} />
      </button>
    </div>
  );
}

function ComposerRow({
  checkIn,
  replyTo,
  onClearReply,
  inputRef,
}: {
  checkIn: CheckInRef;
  replyTo?: CommentParent;
  onClearReply: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const { user } = useCurrentUser();
  const [text, setText] = useState('');
  const add = useAddComment(checkIn);

  if (!user) {
    return (
      <div className="flex items-center justify-between gap-3 border-t border-amber-400/20 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <span className="text-xs text-amber-100/70">Log in to comment</span>
        <LoginArea />
      </div>
    );
  }

  const submit = () => {
    if (!text.trim() || add.isPending) return;
    add.mutate(
      { content: text, parent: replyTo },
      {
        onSuccess: () => { setText(''); onClearReply(); },
      },
    );
  };

  return (
    <div className="border-t border-amber-400/20 px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
      {replyTo && (
        <div className="mb-1.5 flex items-center justify-between rounded-full bg-amber-500/15 px-3 py-1 text-xs text-amber-100/80">
          <span>Replying to comment</span>
          <button
            type="button"
            onClick={onClearReply}
            aria-label="Cancel reply"
            className="flex h-11 w-11 items-center justify-center text-amber-200"
          >
            <X size={16} />
          </button>
        </div>
      )}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); submit(); }}
      >
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={replyTo ? 'Write a reply…' : 'Add a comment…'}
          aria-label="Write a comment"
          className="h-11 min-w-0 flex-1 rounded-full border border-amber-400/30 bg-black/40 px-4 text-sm text-amber-50 placeholder:text-amber-100/40 focus:border-amber-400/70 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!text.trim() || add.isPending}
          aria-label="Send comment"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-500 text-amber-950 transition active:scale-90 disabled:opacity-40"
        >
          <Send size={18} />
        </button>
      </form>
      {add.isError && (
        <p className="px-2 pt-1 text-xs text-red-400">Failed to send — try again.</p>
      )}
    </div>
  );
}
