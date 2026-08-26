import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePostComment } from '@/hooks/usePostComment';
import { LoginArea } from '@/components/auth/LoginArea';
import { NostrEvent } from '@nostrify/nostrify';
import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CommentFormProps {
  root: NostrEvent | URL | `#${string}`;
  reply?: NostrEvent | URL | `#${string}`;
  onSuccess?: () => void;
  placeholder?: string;
  compact?: boolean;
}

export function CommentForm({
  root,
  reply,
  onSuccess,
  placeholder = "Write a comment...",
  compact = false,
}: CommentFormProps) {
  const [content, setContent] = useState('');
  const { user } = useCurrentUser();
  const { mutate: postComment, isPending } = usePostComment();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim() || !user) return;

    postComment(
      { content: content.trim(), root, reply },
      {
        onSuccess: () => {
          setContent('');
          onSuccess?.();
        },
      }
    );
  };

  if (!user) {
    return (
      <div className={cn("rounded-2xl border border-dashed bg-muted/30", compact ? "p-4" : "p-6")}>
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center space-x-2 text-muted-foreground">
            <MessageSquare className="h-5 w-5" />
            <span>Sign in to {reply ? 'reply' : 'comment'}</span>
          </div>
          <LoginArea />
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder}
        className={cn("rounded-2xl resize-none", compact ? "min-h-[80px]" : "min-h-[100px]")}
        disabled={isPending}
      />
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={!content.trim() || isPending}
          size={compact ? "sm" : "default"}
          className="rounded-full px-6"
        >
          {isPending ? 'Posting…' : 'Post'}
        </Button>
      </div>
    </form>
  );
}
