import { useState } from 'react';
import { Link } from 'react-router-dom';
import { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { useAuthor } from '@/hooks/useAuthor';
import { useComments } from '@/hooks/useComments';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { useQueryClient } from '@tanstack/react-query';
import { CommentForm } from './CommentForm';
import { NoteContent } from '@/components/NoteContent';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  MessageSquare,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface CommentProps {
  root: NostrEvent | URL | `#${string}`;
  comment: NostrEvent;
  depth?: number;
  maxDepth?: number;
  limit?: number;
}

export function Comment({ root, comment, depth = 0, maxDepth = 3, limit }: CommentProps) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [showReplies, setShowReplies] = useState(depth < 2); // Auto-expand first 2 levels
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const author = useAuthor(comment.pubkey);
  const { data: commentsData } = useComments(root, limit);
  const { user } = useCurrentUser();
  const { mutate: publishEvent, isPending: isDeleting } = useNostrPublish();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? 'Anonymous';
  const timeAgo = formatDistanceToNow(new Date(comment.created_at * 1000), { addSuffix: true });
  const nevent = nip19.neventEncode({ id: comment.id, author: comment.pubkey, kind: comment.kind });
  const isOwnComment = user?.pubkey === comment.pubkey;

  // Get direct replies to this comment
  const replies = commentsData?.getDirectReplies(comment.id) || [];
  const hasReplies = replies.length > 0;

  const handleDelete = () => {
    publishEvent(
      {
        kind: 5,
        content: '',
        tags: [
          ['e', comment.id],
          ['k', comment.kind.toString()],
        ],
      },
      {
        onSuccess: () => {
          toast({ title: 'Comment deleted' });
          setShowDeleteDialog(false);
          // Optimistically remove the deleted comment from every cached useComments
          // result. Relays may honor the kind 5 deletion request on refetch, but
          // that's not guaranteed — this keeps the UI consistent immediately.
          queryClient.setQueriesData<ReturnType<typeof useComments>['data']>(
            { queryKey: ['nostr', 'comments'] },
            (oldData) => {
              if (!oldData) return oldData;
              const allComments = oldData.allComments.filter((c) => c.id !== comment.id);
              const topLevelComments = oldData.topLevelComments.filter(
                (c) => c.id !== comment.id,
              );
              return {
                ...oldData,
                allComments,
                topLevelComments,
                getDescendants: (id: string) =>
                  oldData.getDescendants(id).filter((c) => c.id !== comment.id),
                getDirectReplies: (id: string) =>
                  oldData.getDirectReplies(id).filter((c) => c.id !== comment.id),
              };
            },
          );
        },
        onError: (error) => {
          toast({
            title: 'Failed to delete comment',
            description: error.message,
            variant: 'destructive',
          });
        },
      },
    );
  };

  return (
    <div className={`space-y-3 ${depth > 0 ? 'ml-6 border-l-2 border-muted pl-4' : ''}`}>
      <Card className="bg-card/50">
        <CardContent className="p-4">
          <div className="space-y-3">
            {/* Comment Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <Link to={`/${nip19.npubEncode(comment.pubkey)}`}>
                  <Avatar className="h-8 w-8 hover:ring-2 hover:ring-primary/30 transition-all cursor-pointer">
                    <AvatarImage src={metadata?.picture} />
                    <AvatarFallback className="text-xs">
                      {displayName.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                </Link>
                <div>
                  <Link
                    to={`/${nip19.npubEncode(comment.pubkey)}`}
                    className="font-medium text-sm hover:text-primary transition-colors"
                  >
                    {displayName}
                  </Link>
                  <p className="text-xs text-muted-foreground">{timeAgo}</p>
                </div>
              </div>
            </div>

            {/* Comment Content */}
            <div className="text-sm">
              <NoteContent event={comment} className="text-sm" />
            </div>

            {/* Comment Actions */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowReplyForm(!showReplyForm)}
                  className="h-8 px-2 text-xs"
                >
                  <MessageSquare className="h-3 w-3 mr-1" />
                  Reply
                </Button>

                {hasReplies && (
                  <Collapsible open={showReplies} onOpenChange={setShowReplies}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 px-2 text-xs">
                        {showReplies ? (
                          <ChevronDown className="h-3 w-3 mr-1" />
                        ) : (
                          <ChevronRight className="h-3 w-3 mr-1" />
                        )}
                        {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                      </Button>
                    </CollapsibleTrigger>
                  </Collapsible>
                )}
              </div>

              {/* Comment menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    aria-label="Comment options"
                  >
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <a
                      href={`https://ditto.pub/${nevent}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-2" />
                      Open in Ditto
                    </a>
                  </DropdownMenuItem>
                  {isOwnComment && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault();
                          setShowDeleteDialog(true);
                        }}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reply Form */}
      {showReplyForm && (
        <div className="ml-6">
          <CommentForm
            root={root}
            reply={comment}
            onSuccess={() => setShowReplyForm(false)}
            placeholder="Write a reply..."
            compact
          />
        </div>
      )}

      {/* Replies */}
      {hasReplies && (
        <Collapsible open={showReplies} onOpenChange={setShowReplies}>
          <CollapsibleContent className="space-y-3">
            {replies.map((reply) => (
              <Comment
                key={reply.id}
                root={root}
                comment={reply}
                depth={depth + 1}
                maxDepth={maxDepth}
                limit={limit}
              />
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete comment?</AlertDialogTitle>
            <AlertDialogDescription>
              This publishes a NIP-09 deletion request (kind 5). Relays and clients that
              honor deletion requests will hide this comment, but deletion is not
              guaranteed across the network.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
