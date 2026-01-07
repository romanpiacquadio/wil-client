import { NextResponse } from 'next/server';
import { AccessToken, type AccessTokenOptions, type VideoGrant } from 'livekit-server-sdk';
import { RoomConfiguration } from '@livekit/protocol';

type ConnectionDetails = {
  serverUrl: string;
  roomName: string;
  participantName: string;
  participantToken: string;
};

// NOTE: you are expected to define the following environment variables in `.env.local`:
const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

// don't cache the results
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    if (LIVEKIT_URL === undefined) {
      throw new Error('LIVEKIT_URL is not defined');
    }
    if (API_KEY === undefined) {
      throw new Error('LIVEKIT_API_KEY is not defined');
    }
    if (API_SECRET === undefined) {
      throw new Error('LIVEKIT_API_SECRET is not defined');
    }

    // Parse agent configuration from request body
    const body = await req.json();
    console.log('[connection-details] Request body recibido:', JSON.stringify(body));
    const agentName: string = body?.room_config?.agents?.[0]?.agent_name;
    console.log('[connection-details] agentName extraído:', agentName);

    // Generate participant token
    const participantName = 'user';
    const participantIdentity = `voice_assistant_user_${Math.floor(Math.random() * 10_000)}`;
    const roomName = `voice_assistant_room_${Math.floor(Math.random() * 10_000)}`;
    console.log(
      '[connection-details] Creando token para room:',
      roomName,
      'con agentName:',
      agentName
    );

    const participantToken = await createParticipantToken(
      { identity: participantIdentity, name: participantName },
      roomName,
      agentName
    );

    // Return connection details
    const data: ConnectionDetails = {
      serverUrl: LIVEKIT_URL,
      roomName,
      participantToken: participantToken,
      participantName,
    };
    const headers = new Headers({
      'Cache-Control': 'no-store',
    });
    return NextResponse.json(data, { headers });
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
      return new NextResponse(error.message, { status: 500 });
    }
  }
}

function createParticipantToken(
  userInfo: AccessTokenOptions,
  roomName: string,
  agentName?: string
): Promise<string> {
  const at = new AccessToken(API_KEY, API_SECRET, {
    ...userInfo,
    ttl: '15m',
  });
  const grant: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  };
  at.addGrant(grant);

  // Metadata hardcodeado para el worker - siempre se configura
  const agentMetadata = {
    user_id: 'user_123',
    user_name: 'Román',
    timezone: 'Europe/Moscow',
    location: { lat: -34.621310234862804, lng: -58.44261097815213 },
    integrations: {
      google_maps: { enabled: true },
      // gmail: { enabled: true },
      // wahatsapp: { enabled: true, token: "..." },
      // waze: { enabled: false },
    },
  };

  const metadataString = JSON.stringify(agentMetadata);
  console.log(
    '[createParticipantToken] Metadata hardcodeado:',
    JSON.stringify(agentMetadata, null, 2)
  );
  console.log('[createParticipantToken] Metadata serializado (string):', metadataString);
  console.log(
    '[createParticipantToken] agentName recibido:',
    agentName,
    '(tipo:',
    typeof agentName,
    ', es string vacío:',
    agentName === '',
    ')'
  );

  // Configurar RoomConfiguration siempre con metadata
  // Si agentName es undefined, usamos string vacío; si es string vacío, lo usamos tal cual
  const finalAgentName = agentName !== undefined ? agentName : '';

  at.roomConfig = new RoomConfiguration({
    metadata: metadataString,
    agents: finalAgentName
      ? [
          {
            agentName: finalAgentName,
          },
        ]
      : [],
  });

  console.log(
    '[createParticipantToken] RoomConfiguration creado:',
    JSON.stringify(at.roomConfig, null, 2)
  );

  return at.toJwt();
}
