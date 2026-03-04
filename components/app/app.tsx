'use client';

import { useMemo, useRef } from 'react';
import {
  RoomAudioRenderer,
  SessionProvider,
  StartAudio,
  useSession,
} from '@livekit/components-react';
import type { AppConfig } from '@/app-config';
import { ViewController } from '@/components/app/view-controller';
import { Toaster } from '@/components/livekit/toaster';
import { useAgentErrors } from '@/hooks/useAgentErrors';
import { useDebugMode } from '@/hooks/useDebug';
import { DEFAULT_START_CALL_CONFIG, type StartCallConfig } from '@/lib/start-call-config';
import { getConnectionDetailsTokenSource } from '@/lib/utils';

const IN_DEVELOPMENT = process.env.NODE_ENV !== 'production';

function AppSetup() {
  useDebugMode({ enabled: IN_DEVELOPMENT });
  useAgentErrors();

  return null;
}

interface AppProps {
  appConfig: AppConfig;
}

export function App({ appConfig }: AppProps) {
  const startCallConfigRef = useRef<StartCallConfig>(DEFAULT_START_CALL_CONFIG);

  const tokenSource = useMemo(() => {
    if (typeof process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT === 'string') {
      return getConnectionDetailsTokenSource(
        process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT,
        appConfig,
        () => startCallConfigRef.current,
        { 'X-Sandbox-Id': appConfig.sandboxId ?? '' }
      );
    }

    return getConnectionDetailsTokenSource('/api/connection-details', appConfig, () => {
      return startCallConfigRef.current;
    });
  }, [appConfig]);

  const session = useSession(
    tokenSource,
    appConfig.agentName ? { agentName: appConfig.agentName } : undefined
  );

  return (
    <SessionProvider session={session}>
      <AppSetup />
      <main className="grid h-svh grid-cols-1 place-content-center">
        <ViewController
          appConfig={appConfig}
          onPrepareStartCall={(config) => {
            startCallConfigRef.current = config;
          }}
        />
      </main>
      <StartAudio label="Start Audio" />
      <RoomAudioRenderer />
      <Toaster />
    </SessionProvider>
  );
}
