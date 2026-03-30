import { NextResponse } from 'next/server';
import { AccessToken, type AccessTokenOptions, type VideoGrant } from 'livekit-server-sdk';
import { RoomConfiguration } from '@livekit/protocol';
import { getDbPool } from '@/lib/server/db';
import { DEFAULT_START_CALL_CONFIG } from '@/lib/start-call-config';


type ConnectionDetails = {
  serverUrl: string;
  roomName: string;
  participantName: string;
  participantToken: string;
};

type ConnectionDetailsRequest = {
  room_config?: {
    agents?: Array<{
      agent_name?: string;
    }>;
  };
  session_config?: {
    user_name?: string;
    google_token?: string;
    system_prompt?: string;
  };
};

type ConversationContext = {
  userId: string;
  conversationId: string;
};

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;
const HARDCODED_AGENT_NAME = 'wil-local-eri-agent';
//const HARDCODED_AGENT_NAME = '';

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

    const body: ConnectionDetailsRequest = await req.json();
    const userName = sanitizeUserName(body?.session_config?.user_name);
    const googleToken = sanitizeGoogleToken(body?.session_config?.google_token);
    const prompt = sanitizePrompt(body?.session_config?.system_prompt);
    const conversationContext = await getConversationContext(userName);

    const participantName = 'user';
    const participantIdentity = `voice_assistant_user_${Math.floor(Math.random() * 10_000)}`;
    const roomName = `voice_assistant_room_${Math.floor(Math.random() * 10_000)}`;

    const participantToken = await createParticipantToken(
      { identity: participantIdentity, name: participantName },
      roomName,
      {
        userName,
        googleToken,
        prompt,
        conversationContext,
      }
    );

    const data: ConnectionDetails = {
      serverUrl: LIVEKIT_URL,
      roomName,
      participantToken,
      participantName,
    };

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
      return new NextResponse(error.message, { status: 500 });
    }

    return new NextResponse('Unknown error', { status: 500 });
  }
}

function createParticipantToken(
  userInfo: AccessTokenOptions,
  roomName: string,
  options: {
    userName: string;
    googleToken: string;
    prompt: string;
    conversationContext: ConversationContext;
  }
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

  const agentMetadata = {
    user_id: options.conversationContext.userId,
    conversation_id: options.conversationContext.conversationId,
    user_name: options.userName,
    system_prompt: options.prompt,
    voice: true,
    voice_credits: true,
    text_only: false,
    timezone: 'America/Argentina/Buenos_Aires',
    location: { lat: -34.621310234862804, lng: -58.44261097815213 },
    integrations: {
      google_gmail: {
        enabled: true,
        token: options.googleToken,
        permissions: ['gmail-send-emails', 'gmail-read-search-emails'],
      },
      google_calendar: {
        enabled: true,
        token: options.googleToken,
        permissions: ['gcal-manage-events'],
      },
      google_maps: {
        enabled: false,
        // permissions: ['google-maps-search-places'],
      },
    },
  };

  at.roomConfig = new RoomConfiguration({
    metadata: JSON.stringify(agentMetadata),
    agents: [{ agentName: HARDCODED_AGENT_NAME }],
  });

  return at.toJwt();
}

function sanitizeUserName(value?: string): string {
  if (!value) {
    return DEFAULT_START_CALL_CONFIG.userName;
  }

  const normalized = value.trim();
  return normalized || DEFAULT_START_CALL_CONFIG.userName;
}

function sanitizeGoogleToken(value?: string): string {
  return value?.trim() ?? '';
}

function sanitizePrompt(value?: string): string {
  return value?.trim() ?? '';
}

async function getConversationContext(userName: string): Promise<ConversationContext> {
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const userResult = await client.query<{ id: string }>(
      `
      SELECT id
      FROM users
      WHERE display_name = $1
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
      LIMIT 1
      `,
      [userName]
    );

    let userId = userResult.rows[0]?.id;

    if (!userId) {
      const createdUserResult = await client.query<{ id: string }>(
        `
        INSERT INTO users (name, profile)
        VALUES ($1, $2::jsonb)
        RETURNING id
        `,
        [userName, JSON.stringify({})]
      );
      userId = createdUserResult.rows[0]?.id;
    }

    if (!userId) {
      throw new Error('Could not resolve user ID');
    }

    const conversationResult = await client.query<{ id: string }>(
      `
      INSERT INTO conversations (user_id, last_updated, metadata)
      VALUES ($1, NOW(), $2::jsonb)
      RETURNING id
      `,
      [userId, JSON.stringify({ source: 'wil-client' })]
    );

    const conversationId = conversationResult.rows[0]?.id;

    if (!conversationId) {
      throw new Error('Could not create conversation');
    }

    await client.query('COMMIT');

    return {
      userId,
      conversationId,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
