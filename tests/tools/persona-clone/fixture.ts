import type { Browser, WebRoute } from '@e2e-dev/web';
import type { JsonValue } from 'e2e';

/**
 * Clone Yourself — "Personal Avatar Builder" in the English UI.
 *
 * Two tabs, avatars and voices, each with a create form (name + one file) and a
 * library, under a banner showing the plan's capacity for that kind. Creating a
 * clone sends the file to HeyGen and counts against the plan, so every call is
 * stubbed here: the plan's capabilities, the upload's presigned URL and bucket,
 * and the clone endpoints themselves — which keep a small library in memory, so
 * a clone created shows up in the list and a deleted one leaves it.
 */
export const ROUTE = '/tools/persona-clone';
export const TOOL_NAME = 'Personal Avatar Builder';
export const TOOL_NAME_AR = 'منشئ الأفاتار الشخصي';

// Every tab leads with a Tabler icon-font glyph. A string name matches without
// it; a RegExp is matched against the name with the glyph in front, so never
// anchor one with `^`.
export const TAB = { avatars: 'My Avatars', voices: 'My Voices' };
export const SUBTAB = {
  createAvatar: 'Clone Your Avatar',
  avatarLibrary: 'My Avatars Library',
  createVoice: 'Clone Your Voice',
  voiceLibrary: 'My Voices Library'
};
export const BUTTON = { avatar: 'Clone My Avatar', voice: 'Clone My Voice' };
export const PLACEHOLDER = {
  avatarName: 'e.g., Sara - Studio (Avatar Name)',
  voiceName: 'e.g., Sara - Studio (Voice Name)'
};

export const TEXT = {
  avatarEmpty: 'No avatars yet. Upload a photo to create one.',
  voiceEmpty: 'No voices yet. Upload a sample to create one.',
  notImage: 'That file is not an image. Choose a JPG, PNG or WEBP.',
  notAudio: 'That file is not audio. Choose an MP3, WAV, M4A or OGG file.',
  uploadFailed: 'Upload failed. Please try again.',
  saveFailed: "We couldn't save your clone. Please try again."
};

export const FILES = {
  photo: 'tests/fixtures/face.png',
  voice: 'tests/fixtures/narration.wav',
  notMedia: 'tests/fixtures/reference.txt'
};

export type CloneKind = 'avatars' | 'voices';
export type CloneStatus = 'Pending' | 'Completed' | 'Failed';

export interface Clone {
  id: number;
  name: string;
  sourceUrl: string;
  status: CloneStatus;
  previewUrl?: string;
  errorMessage?: string;
}

/** A plan's capacity for one kind; `used` follows the library unless given. */
export interface Capacity {
  limit: number;
  used?: number;
  isUnlimited?: boolean;
}

export type Refusal = { refused: string; errorType?: string } | { httpStatus: number };

export interface PersonaCloneOptions {
  avatars?: Clone[];
  voices?: Clone[];
  /** Capacity per kind; 3 each unless said otherwise. */
  avatarCapacity?: Capacity;
  voiceCapacity?: Capacity;
  /** The plan's capabilities cannot be read. */
  capabilitiesFail?: boolean;
  /** What creating a clone comes to; saved unless said otherwise. */
  create?: 'saved' | Refusal;
  /** The library cannot be read. */
  listFails?: boolean;
  /** Deleting fails at the server. */
  deleteFails?: boolean;
  /** The upload's presigned URL is refused. */
  uploadFails?: boolean;
}

export interface PersonaCloneMock {
  readonly creates: { kind: CloneKind; name: string; sourceUrl: string }[];
  readonly deletes: { kind: CloneKind; id: number }[];
  readonly uploads: { mediaKind: string; fileName: string }[];
  /** The libraries as they stand, newest first. */
  readonly library: Record<CloneKind, Clone[]>;
}

/** Where a stubbed upload claims the file now lives. */
export const uploadedUrl = (mediaKind: string, fileName: string) => `https://e2e-uploads.invalid/cloned-${mediaKind}s/${fileName}`;

function ok(data: unknown): JsonValue {
  return { succeeded: true, message: '', statusCode: 200, errorType: null, errors: null, data: data as JsonValue };
}

function body(route: WebRoute): Record<string, unknown> {
  return route.request.postData ? JSON.parse(route.request.postData) : {};
}

async function refuse(route: WebRoute, refusal: Refusal): Promise<void> {
  if ('httpStatus' in refusal) {
    await route.fulfill({ status: refusal.httpStatus, json: { title: 'Internal Server Error' } });
    return;
  }
  await route.fulfill({
    json: {
      succeeded: false,
      message: refusal.refused,
      statusCode: 400,
      errorType: refusal.errorType ?? 'Failure',
      errors: null,
      data: null
    }
  });
}

/** A run of clones, newest first: `name 1` … `name n`, all ready. */
export function clones(count: number, name = 'Clone', status: CloneStatus = 'Completed'): Clone[] {
  return Array.from({ length: count }, (_, i) => ({
    id: 500 + i,
    name: `${name} ${i + 1}`,
    sourceUrl: `https://e2e-uploads.invalid/seed/${name.toLowerCase()}-${i + 1}`,
    status
  }));
}

export async function mockPersonaClone(browser: Browser, options: PersonaCloneOptions = {}): Promise<PersonaCloneMock> {
  const creates: PersonaCloneMock['creates'] = [];
  const deletes: PersonaCloneMock['deletes'] = [];
  const uploads: PersonaCloneMock['uploads'] = [];
  const library: Record<CloneKind, Clone[]> = {
    avatars: [...(options.avatars ?? [])],
    voices: [...(options.voices ?? [])]
  };
  let nextId = 9_000;

  const capacity = (kind: CloneKind) => {
    const given = (kind === 'avatars' ? options.avatarCapacity : options.voiceCapacity) ?? { limit: 3 };
    const used = given.used ?? library[kind].length;
    return {
      limit: given.limit,
      used,
      remaining: given.isUnlimited ? null : Math.max(0, given.limit - used),
      isUnlimited: !!given.isUnlimited
    };
  };

  await browser.route('**/api/subscriptions/capabilities', async (route) => {
    if (options.capabilitiesFail) {
      await route.fulfill({ status: 500, json: { title: 'Internal Server Error' } });
      return;
    }
    await route.fulfill({
      json: ok({
        plan: { code: 'e2e', name: 'E2E Plan', hasActiveSubscription: true },
        features: {},
        limits: { max_avatar_clones: capacity('avatars'), max_voice_clones: capacity('voices') }
      })
    });
  });

  await browser.route('**/api/Files/persona-clone-presigned-url', async (route) => {
    const request = body(route);
    const mediaKind = String(request.mediaKind);
    const fileName = String(request.fileName);
    uploads.push({ mediaKind, fileName });
    if (options.uploadFails) {
      await refuse(route, { refused: 'Uploads are paused.' });
      return;
    }
    await route.fulfill({
      json: ok({ uploadUrl: `https://e2e-uploads.invalid/put/${fileName}`, fileUrl: uploadedUrl(mediaKind, fileName) })
    });
  });
  await browser.route('https://e2e-uploads.invalid/**', async (route) => {
    await route.fulfill({ status: 200, body: '' });
  });

  await browser.route('**/api/persona-clones/**', async (route) => {
    const url = new URL(route.request.url);
    const match = url.pathname.match(/\/api\/persona-clones\/(avatars|voices)(?:\/(\d+))?$/);
    if (!match) {
      await route.abort();
      return;
    }
    const kind = match[1] as CloneKind;
    const id = match[2] ? Number(match[2]) : null;
    const { method } = route.request;

    if (method === 'GET' && id === null) {
      if (options.listFails) {
        await route.fulfill({ status: 500, json: { title: 'Internal Server Error' } });
        return;
      }
      const pageNumber = Number(url.searchParams.get('pageNumber') ?? 1);
      const pageSize = Number(url.searchParams.get('pageSize') ?? 8);
      const all = library[kind];
      const totalPages = Math.max(1, Math.ceil(all.length / pageSize));
      await route.fulfill({
        json: ok({
          items: all.slice((pageNumber - 1) * pageSize, pageNumber * pageSize),
          pageNumber,
          pageSize,
          totalCount: all.length,
          totalPages,
          hasPreviousPage: pageNumber > 1,
          hasNextPage: pageNumber < totalPages
        })
      });
      return;
    }

    if (method === 'POST' && id === null) {
      const request = body(route);
      creates.push({ kind, name: String(request.name), sourceUrl: String(request.sourceUrl) });
      const outcome = options.create ?? 'saved';
      if (outcome !== 'saved') {
        await refuse(route, outcome);
        return;
      }
      // An avatar is ready at once; a voice is finished later by the backend's poller
      const clone: Clone = {
        id: nextId++,
        name: String(request.name),
        sourceUrl: String(request.sourceUrl),
        status: kind === 'avatars' ? 'Completed' : 'Pending'
      };
      library[kind].unshift(clone);
      await route.fulfill({ json: ok(clone) });
      return;
    }

    if (method === 'DELETE' && id !== null) {
      deletes.push({ kind, id });
      if (options.deleteFails) {
        await route.fulfill({ status: 500, json: { title: 'Internal Server Error' } });
        return;
      }
      library[kind] = library[kind].filter((clone) => clone.id !== id);
      await route.fulfill({ json: ok(true) });
      return;
    }

    await route.abort();
  });

  return { creates, deletes, uploads, library };
}

/** The vocabulary of this tool's screens, for the agent; part of the replay cache's key. */
export const PERSONA_CLONE_CONTEXT = [
  'This is the Personal Avatar Builder (Clone Yourself) in the LRNOVA dashboard.',
  'It has two tabs, My Avatars and My Voices. Each has two sub-tabs: a create form (a name box, a drop zone for one file, and a Clone button) and a library of what was created.',
  'A banner above shows how many clones the plan allows and how many are used.'
].join(' ');
