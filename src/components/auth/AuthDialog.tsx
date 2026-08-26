import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Download,
  Upload,
  Eye,
  EyeOff,
  Key,
  Loader2,
  FileUp,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/hooks/useToast';
import {
  useLoginActions,
  generateNostrConnectParams,
  generateNostrConnectURI,
  type NostrConnectParams,
  type NostrConnectStatus,
} from '@/hooks/useLoginActions';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';

interface AuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'welcome' | 'generate' | 'secure' | 'profile' | 'login';

const validateNsec = (nsec: string) => /^nsec1[a-zA-Z0-9]{58}$/.test(nsec);
const validateBunkerUri = (uri: string) => uri.startsWith('bunker://');

const connectStatusLabel = (status: NostrConnectStatus | null): string => {
  switch (status) {
    case 'awaiting-connect':
      return 'Waiting for signer connection…';
    case 'getting-public-key':
      return 'Getting public key…';
    default:
      return '';
  }
};

/** Check if running on an actual mobile device (not just a small screen). */
function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Download an nsec to a text file — same behavior as the previous SignupDialog. */
function downloadNsecFile(nsec: string) {
  const decoded = nip19.decode(nsec);
  if (decoded.type !== 'nsec') throw new Error('Invalid nsec key');
  const pubkey = getPublicKey(decoded.data);
  const npub = nip19.npubEncode(pubkey);
  const filename = `nostr-${location.hostname.replaceAll(/\./g, '-')}-${npub.slice(5, 9)}.nsec.txt`;

  const blob = new Blob([nsec], { type: 'text/plain; charset=utf-8' });
  const url = globalThis.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  globalThis.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

const AuthDialog: React.FC<AuthDialogProps> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState<Step>('welcome');

  // Signup state
  const [nsec, setNsec] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [profileData, setProfileData] = useState({ name: '', about: '', picture: '' });

  // Login state — single input accepting either an nsec or a bunker URI.
  const [loginInput, setLoginInput] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Nostrconnect ("Open signer app") state. No QR code is shown — the URI is
  // launched directly on the device and the app listens for the handshake.
  const [nostrConnectParams, setNostrConnectParams] = useState<NostrConnectParams | null>(null);
  const [nostrConnectUri, setNostrConnectUri] = useState('');
  const [connectError, setConnectError] = useState<string | null>(null);
  // Progress status for the nostrconnect handshake. `null` means the user
  // hasn't launched the signer yet (or they canceled).
  const [connectStatus, setConnectStatus] = useState<NostrConnectStatus | null>(null);
  // Whether the user has launched the signer app. Until then we show the
  // login form; once launched we swap in the progress view.
  const [hasOpenedSigner, setHasOpenedSigner] = useState(false);

  const login = useLoginActions();
  // Stable refs so the nostrconnect listening effect below doesn't restart on
  // every parent render. Parents typically pass inline arrow functions for
  // onClose, and useLoginActions returns a fresh object each render — without
  // stable refs, an effect depending on them would tear down the in-flight
  // subscription on every render and cause approved logins to be swallowed.
  const loginRef = useRef(login);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    loginRef.current = login;
  }, [login]);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const { mutateAsync: publishEvent, isPending: isPublishing } = useNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const { user: currentUser } = useCurrentUser();
  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Reset state when the dialog closes.
  // This is the "reset state when a prop changes" pattern; the usual
  // React-preferred alternative is a `key` prop on the caller, but the
  // public API of this component is a simple open/close boolean, so we
  // reset here. The multiple setState calls are intentional.
  useEffect(() => {
    if (!isOpen) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setStep('welcome');
      setNsec('');
      setLoginInput('');
      setShowKey(false);
      setIsGenerating(false);
      setIsLoggingIn(false);
      setLoginError('');
      setProfileData({ name: '', about: '', picture: '' });
      setNostrConnectParams(null);
      setNostrConnectUri('');
      setConnectError(null);
      setConnectStatus(null);
      setHasOpenedSigner(false);
      /* eslint-enable react-hooks/set-state-in-effect */
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    }
  }, [isOpen]);

  // Generate a nostrconnect session and return its URI. The listening effect
  // (keyed on the params) handles the handshake once params are set.
  const generateConnectSession = useCallback((): string => {
    const relayUrls = login.getRelayUrls();
    const params = generateNostrConnectParams(relayUrls);
    const uri = generateNostrConnectURI(params, {
      callback: isMobileDevice() ? `${window.location.origin}/remoteloginsuccess` : undefined,
    });
    setNostrConnectParams(params);
    setNostrConnectUri(uri);
    setConnectError(null);
    return uri;
  }, [login]);

  // Start listening for a nostrconnect response once params are set.
  //
  // Deps are intentionally limited to `nostrConnectParams` so that parent
  // re-renders (which produce fresh onClose closures and a fresh `login`
  // object from useLoginActions) do NOT tear down an in-flight
  // subscription. An earlier version used a `cancelled` flag flipped by
  // the effect's cleanup, which caused a successful nostrconnect response
  // to be silently swallowed after the signer approved — the subscription
  // was re-created mid-handshake and the first instance's success branch
  // saw `cancelled === true`.
  //
  // Cancellation is handled explicitly by the `isOpen` effect (on dialog
  // close) and by handleConnectRetry() (on user cancel/retry).
  useEffect(() => {
    if (!nostrConnectParams) return;

    const startListening = async () => {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        await loginRef.current.nostrconnect(
          nostrConnectParams,
          controller.signal,
          (status) => {
            if (controller.signal.aborted) return;
            setConnectStatus(status);
          },
        );
        // If the dialog was explicitly closed (handled by the isOpen
        // effect, which aborts the controller), don't try to re-close it.
        // Otherwise the user is logged in — close the dialog.
        if (controller.signal.aborted) return;
        onCloseRef.current();
      } catch (error) {
        // AbortError means we intentionally aborted (dialog closed or retry)
        if (error instanceof Error && error.name === 'AbortError') return;
        if (controller.signal.aborted) return;
        console.error('Nostrconnect failed:', error);
        setConnectStatus(null);
        setConnectError(error instanceof Error ? error.message : String(error));
      }
    };

    startListening();

    // No cleanup here: we do NOT want a re-render-triggered effect teardown
    // to cancel the in-flight subscription.
  }, [nostrConnectParams]);

  const handleConnectRetry = useCallback(() => {
    abortControllerRef.current?.abort();
    setNostrConnectParams(null);
    setNostrConnectUri('');
    setConnectError(null);
    setConnectStatus(null);
    setHasOpenedSigner(false);
  }, []);

  // Launch a remote signer app via nostrconnect. Generates the session (if
  // needed) and navigates to the URI; the listening effect handles the
  // handshake. No QR code is shown.
  const handleOpenSignerApp = () => {
    setLoginError('');
    setHasOpenedSigner(true);
    const uri = nostrConnectUri || generateConnectSession();
    if (uri) {
      window.location.href = uri;
    }
  };

  // Signup: generate a key with a brief spinner for feedback.
  const generateKey = () => {
    setIsGenerating(true);
    setTimeout(() => {
      const sk = generateSecretKey();
      setNsec(nip19.nsecEncode(sk));
      setStep('secure');
      setIsGenerating(false);
    }, 750);
  };

  // Signup: download the nsec to a file and move on to the profile step.
  const downloadAndProceed = () => {
    try {
      downloadNsecFile(nsec);
      login.nsec(nsec);
      setStep('profile');
    } catch {
      toast({
        title: 'Download failed',
        description: 'Could not download the key file. Please copy it manually.',
        variant: 'destructive',
      });
    }
  };

  // Login: submit the entered value — either an nsec or a bunker:// URI.
  const handleLogin = () => {
    const value = loginInput.trim();
    if (!value) {
      setLoginError('Enter your secret key or bunker URI.');
      return;
    }

    if (validateBunkerUri(value)) {
      setIsLoggingIn(true);
      setLoginError('');
      login
        .bunker(value)
        .then(() => onClose())
        .catch(() => {
          setLoginError('Failed to connect. Check the bunker URI.');
          setIsLoggingIn(false);
        });
      return;
    }

    if (!validateNsec(value)) {
      setLoginError('Enter a valid nsec1… key or bunker://… URI.');
      return;
    }

    setIsLoggingIn(true);
    setLoginError('');
    // Timeout gives the UI a chance to repaint before the synchronous login.
    setTimeout(() => {
      try {
        login.nsec(value);
        onClose();
      } catch {
        setLoginError("Couldn't log in with this key.");
        setIsLoggingIn(false);
      }
    }, 50);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content && validateNsec(content.trim())) {
        setLoginInput(content.trim());
        setLoginError('');
      } else {
        setLoginError('File does not contain a valid secret key.');
      }
    };
    reader.onerror = () => setLoginError('Failed to read file.');
    reader.readAsText(file);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Please select an image.', variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Image too large (max 5MB).', variant: 'destructive' });
      return;
    }

    try {
      const tags = await uploadFile(file);
      const url = tags[0]?.[1];
      if (url) setProfileData((prev) => ({ ...prev, picture: url }));
    } catch {
      toast({ title: 'Upload failed.', variant: 'destructive' });
    }
  };

  const finishSignup = async (skipProfile = false) => {
    try {
      if (!skipProfile && (profileData.name || profileData.about || profileData.picture)) {
        // Defensive guard: only publish kind 0 if the current signer is
        // the freshly generated key. If the auto-switch ever fails (e.g.
        // a regression in useLoginActions), publishing here would sign
        // with the *previous* user's signer and overwrite their kind 0
        // metadata — destroying their profile. Refuse rather than risk
        // it.
        let expectedPubkey: string | null = null;
        try {
          const decoded = nip19.decode(nsec);
          if (decoded.type === 'nsec') {
            expectedPubkey = getPublicKey(decoded.data);
          }
        } catch {
          // fall through to the mismatch branch below
        }

        if (!expectedPubkey || currentUser?.pubkey !== expectedPubkey) {
          toast({
            title: 'Profile not saved',
            description:
              'The new account is not active yet, so your profile was not published (this prevents overwriting another account). Try again from your profile settings.',
            variant: 'destructive',
          });
          return;
        }

        const metadata: Record<string, string> = {};
        if (profileData.name) metadata.name = profileData.name;
        if (profileData.about) metadata.about = profileData.about;
        if (profileData.picture) metadata.picture = profileData.picture;
        await publishEvent({ kind: 0, content: JSON.stringify(metadata) });
      }
    } catch {
      toast({
        title: 'Profile setup failed',
        description: 'Your account was created but the profile could not be saved. You can update it later.',
        variant: 'destructive',
      });
    } finally {
      onClose();
    }
  };

  const getTitle = () => {
    switch (step) {
      case 'welcome':
        return 'Welcome';
      case 'generate':
        return 'Create a Nostr account';
      case 'secure':
        return 'Save your key';
      case 'profile':
        return 'Your profile';
      case 'login':
        return 'Log in';
    }
  };

  // Once the user launches the signer app we replace the login form with a
  // progress view so they see feedback while the handshake completes.
  const showProgressView = hasOpenedSigner;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-sm max-h-[90dvh] p-0 gap-0 overflow-hidden rounded-2xl overflow-y-auto">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="text-lg font-semibold leading-none tracking-tight text-center">
            {getTitle()}
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-6 pt-4 space-y-5">
          {/* Welcome step — the unified entry point. */}
          {step === 'welcome' && (
            <div className="space-y-5 text-center">
              <div className="flex size-32 text-6xl bg-primary/10 rounded-full items-center justify-center mx-auto">
                🔑
              </div>

              <div className="space-y-2">
                <Button onClick={() => setStep('generate')} className="w-full h-12 rounded-full">
                  Create a new Nostr account
                </Button>
                <Button
                  variant="link"
                  onClick={() => setStep('login')}
                  className="w-full text-muted-foreground"
                >
                  Log in to an existing account
                </Button>
              </div>
            </div>
          )}

          {/* Generate step. */}
          {step === 'generate' && (
            <div className="space-y-5 text-center">
              <div className="relative w-20 h-20 mx-auto">
                {isGenerating ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-12 h-12 text-primary animate-spin" />
                  </div>
                ) : (
                  <div className="absolute inset-0 rounded-full bg-primary/10 flex items-center justify-center">
                    <Key className="w-8 h-8 text-primary" />
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <p className="font-medium">
                  {isGenerating ? 'Creating your key…' : 'Your key is your identity'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isGenerating
                    ? 'This only takes a moment.'
                    : "We'll generate a secret key just for you. Keep it safe — it's the only way to log in."}
                </p>
              </div>

              {!isGenerating && (
                <Button onClick={generateKey} className="w-full h-12 rounded-full">
                  Generate key
                </Button>
              )}

              <button
                onClick={() => setStep('welcome')}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Back
              </button>
            </div>
          )}

          {/* Secure step — show + download nsec. */}
          {step === 'secure' && (
            <div className="space-y-4">
              <div className="flex size-14 bg-primary/10 rounded-full items-center justify-center mx-auto">
                <Key className="w-7 h-7 text-primary" />
              </div>

              <p className="text-sm text-muted-foreground text-center">
                Store your key somewhere safe. You'll need it to log in again.
              </p>

              <div className="relative">
                <Input
                  type={showKey ? 'text' : 'password'}
                  value={nsec}
                  readOnly
                  className="pr-10 font-mono"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>

              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                <p className="text-xs text-amber-900 dark:text-amber-300">
                  This key is your only way to access your account. If you lose it, you lose the account.
                </p>
              </div>

              <Button onClick={downloadAndProceed} className="w-full h-12 rounded-full">
                <Download className="w-4 h-4 mr-2" />
                Download &amp; continue
              </Button>
            </div>
          )}

          {/* Profile step — optional metadata. */}
          {step === 'profile' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Tell others a bit about yourself (optional).
              </p>

              <div className={`space-y-4 ${isPublishing ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="space-y-1.5">
                  <label htmlFor="profile-name" className="text-sm font-medium">
                    Display name
                  </label>
                  <Input
                    id="profile-name"
                    value={profileData.name}
                    onChange={(e) =>
                      setProfileData((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="Your name"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="profile-about" className="text-sm font-medium">
                    Bio
                  </label>
                  <Textarea
                    id="profile-about"
                    value={profileData.about}
                    onChange={(e) =>
                      setProfileData((prev) => ({ ...prev, about: e.target.value }))
                    }
                    placeholder="A little about you…"
                    className="resize-none"
                    rows={3}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="profile-picture" className="text-sm font-medium">
                    Avatar
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id="profile-picture"
                      value={profileData.picture}
                      onChange={(e) =>
                        setProfileData((prev) => ({ ...prev, picture: e.target.value }))
                      }
                      placeholder="https://…"
                      className="flex-1"
                    />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      ref={avatarFileInputRef}
                      onChange={handleAvatarUpload}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => avatarFileInputRef.current?.click()}
                      disabled={isUploading}
                      title="Upload avatar"
                    >
                      {isUploading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Button
                  onClick={() => finishSignup(false)}
                  disabled={isPublishing}
                  className="w-full h-12 rounded-full"
                >
                  {isPublishing ? 'Saving…' : 'Finish'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => finishSignup(true)}
                  disabled={isPublishing}
                  className="w-full rounded-full"
                >
                  Skip for now
                </Button>
              </div>
            </div>
          )}

          {/* Login step. */}
          {step === 'login' && (
            <div className="space-y-4">
              {connectError ? (
                <div className="flex flex-col items-center space-y-3 py-4">
                  <p className="text-sm text-destructive text-center">{connectError}</p>
                  <Button variant="outline" onClick={handleConnectRetry} className="rounded-full">
                    Try again
                  </Button>
                </div>
              ) : showProgressView ? (
                <div className="flex flex-col items-center space-y-4 py-6 w-full">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground text-center min-h-[1.25rem]">
                    {connectStatusLabel(connectStatus) || 'Waiting for your signer…'}
                  </p>
                  <button
                    type="button"
                    onClick={handleConnectRetry}
                    className="text-sm text-primary hover:underline underline-offset-4 font-medium"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <NsecLoginForm
                  loginInput={loginInput}
                  setLoginInput={setLoginInput}
                  loginError={loginError}
                  setLoginError={setLoginError}
                  isLoggingIn={isLoggingIn}
                  onSubmit={handleLogin}
                  onFileChange={handleFileUpload}
                  onOpenSignerApp={handleOpenSignerApp}
                  fileInputRef={fileInputRef}
                />
              )}

              {!connectError && !showProgressView && (
                <button
                  onClick={() => setStep('welcome')}
                  className="w-full text-sm text-muted-foreground hover:text-foreground"
                >
                  Back
                </button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

/** Shared login input (nsec or bunker URI) + submit + actions dropdown. */
interface NsecLoginFormProps {
  loginInput: string;
  setLoginInput: (v: string) => void;
  loginError: string;
  setLoginError: (v: string) => void;
  isLoggingIn: boolean;
  onSubmit: () => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenSignerApp: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

const NsecLoginForm: React.FC<NsecLoginFormProps> = ({
  loginInput,
  setLoginInput,
  loginError,
  setLoginError,
  isLoggingIn,
  onSubmit,
  onFileChange,
  onOpenSignerApp,
  fileInputRef,
}) => (
  <form
    onSubmit={(e) => {
      e.preventDefault();
      onSubmit();
    }}
    className="space-y-3"
  >
    <div className="relative">
      <Input
        type="password"
        value={loginInput}
        onChange={(e) => {
          setLoginInput(e.target.value);
          if (loginError) setLoginError('');
        }}
        placeholder="nsec1… or bunker://…"
        autoComplete="off"
        className={`pr-10 ${
          loginError ? 'border-destructive focus-visible:ring-destructive' : ''
        }`}
      />
      <input
        type="file"
        accept=".txt"
        className="hidden"
        ref={fileInputRef}
        onChange={onFileChange}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
            title="More login options"
          >
            <Upload className="h-4 w-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
            <FileUp className="h-4 w-4" />
            Select key file
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onOpenSignerApp}>
            <ExternalLink className="h-4 w-4" />
            Open signer app
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    {loginError && <p className="text-sm text-destructive">{loginError}</p>}

    <Button
      type="submit"
      disabled={isLoggingIn || !loginInput.trim()}
      className="w-full rounded-full"
    >
      {isLoggingIn ? 'Logging in…' : 'Log in'}
    </Button>
  </form>
);

export default AuthDialog;
