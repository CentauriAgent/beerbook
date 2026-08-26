import { useMutation } from "@tanstack/react-query";
import { BlossomUploader, NostrBuildUploader } from '@nostrify/nostrify/uploaders';
import type { NostrSigner } from "@nostrify/nostrify";

import { useCurrentUser } from "./useCurrentUser";
import { useAppContext } from "./useAppContext";
import { getEffectiveBlossomServers } from "@/lib/appBlossom";

export function useUploadFile() {
  const { user } = useCurrentUser();
  const { config } = useAppContext();

  return useMutation({
    mutationFn: async (file: File) => {
      if (!user) {
        throw new Error('Must be logged in to upload files');
      }

      const tags = await uploadWithFallback(file, user.signer, config);
      const url = tags.find(([name]) => name === 'url')?.[1];
      if (!url) {
        throw new Error('Upload succeeded but no image URL was returned');
      }
      return tags;
    },
  });
}

async function uploadWithFallback(
  file: File,
  signer: NostrSigner,
  config: ReturnType<typeof useAppContext>['config'],
): Promise<string[][]> {
  const servers = getEffectiveBlossomServers(
    config.blossomServerMetadata,
    config.useAppBlossomServers,
  );

  // 1. Try Blossom servers first (BUD-02).
  if (servers.length > 0) {
    try {
      const uploader = new BlossomUploader({ servers, signer });
      return await uploader.upload(file);
    } catch (error) {
      console.warn('[beerbook] Blossom upload failed, falling back to nostr.build', error);
    }
  }

  // 2. Fallback: nostr.build (NIP-98 authenticated upload, same NIP-94 tags).
  const uploader = new NostrBuildUploader({ signer });
  return uploader.upload(file);
}
