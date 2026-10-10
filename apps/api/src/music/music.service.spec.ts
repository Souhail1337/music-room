import {
  DeezerClient,
  DeezerTrack,
  DeezerUnavailableError,
} from './deezer.client.js';
import { MusicService, SEARCH_TTL_MS } from './music.service.js';
import { TracksRepository } from './tracks.repository.js';

const TRACK: DeezerTrack = {
  id: '3135556',
  title: 'One More Time',
  artist: 'Daft Punk',
  artworkUrl: 'https://cdn/cover.jpg',
  durationSec: 320,
  previewUrl: 'https://cdn/preview.mp3',
};

function setup() {
  let now = 1_000_000;
  const deezer = {
    search: vi.fn(async () => [TRACK]),
    getTrack: vi.fn(async (id: string) => (id === TRACK.id ? TRACK : null)),
  };
  const rows = new Map<string, unknown>();
  const tracks = {
    findById: vi.fn(async (id: string) => rows.get(id) ?? null),
    upsert: vi.fn(async (t: { id: string }) => {
      rows.set(t.id, t);
      return t;
    }),
  };
  const service = new MusicService(
    deezer as unknown as DeezerClient,
    tracks as unknown as TracksRepository,
    () => now,
  );
  return { service, deezer, tracks, advance: (ms: number) => (now += ms) };
}

describe('MusicService', () => {
  it('serves the same query from the cache for 10 minutes', async () => {
    const { service, deezer, advance } = setup();
    const first = await service.search('Daft Punk');
    await service.search('  daft   punk ');
    advance(SEARCH_TTL_MS - 1);
    await service.search('daft punk');
    expect(deezer.search).toHaveBeenCalledTimes(1);
    expect(first[0]).toEqual({
      id: TRACK.id,
      title: TRACK.title,
      artist: TRACK.artist,
      artworkUrl: TRACK.artworkUrl,
      durationSec: TRACK.durationSec,
    });
    expect(first[0]).not.toHaveProperty('previewUrl');
    advance(2);
    await service.search('daft punk');
    expect(deezer.search).toHaveBeenCalledTimes(2);
  });

  it('maps Deezer being down to 503 MUSIC_UNAVAILABLE and caches nothing', async () => {
    const { service, deezer } = setup();
    deezer.search.mockRejectedValueOnce(new DeezerUnavailableError());
    await expect(service.search('x')).rejects.toMatchObject({
      code: 'MUSIC_UNAVAILABLE',
    });
    await service.search('x');
    expect(deezer.search).toHaveBeenCalledTimes(2);
  });

  it('ensureTrack upserts from Deezer once, then reads the row', async () => {
    const { service, deezer, tracks } = setup();
    await service.ensureTrack(TRACK.id);
    await service.ensureTrack(TRACK.id);
    expect(deezer.getTrack).toHaveBeenCalledTimes(1);
    expect(tracks.upsert).toHaveBeenCalledWith(
      expect.not.objectContaining({ previewUrl: expect.anything() }),
    );
  });

  it('ensureTrack: unknown or malformed id → TRACK_NOT_FOUND', async () => {
    const { service } = setup();
    await expect(service.ensureTrack('999')).rejects.toMatchObject({
      code: 'TRACK_NOT_FOUND',
    });
    await expect(service.ensureTrack('abc')).rejects.toMatchObject({
      code: 'TRACK_NOT_FOUND',
    });
  });

  it('preview always asks Deezer for a fresh URL', async () => {
    const { service, deezer } = setup();
    await service.preview(TRACK.id);
    await service.preview(TRACK.id);
    expect(deezer.getTrack).toHaveBeenCalledTimes(2);
  });
});
