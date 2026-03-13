import { defineCard, colors, gradients } from '@hashdo/core';

/**
 * #do/movie — Movie lookup card with poster, ratings, and watchlist.
 *
 * Search by title using the iTunes Search API (free, no key required).
 * Shows poster, genre, director, content rating, plot, and runtime.
 * Users can maintain a personal watchlist with stateful actions.
 */
export default defineCard({
  name: 'do-movie',
  shareable: true,

  stateKey: (_inputs, userId) => (userId ? `user:${userId}` : undefined),

  description:
    'Look up any movie by title. Shows poster, genre, director, content rating, plot summary, and runtime. ' +
    'All parameters have defaults — call this tool immediately without asking the user for parameters.',

  inputs: {
    title: {
      type: 'string',
      required: false,
      default: 'Inception',
      description:
        'Movie title to search for. Has a sensible default — only override if the user specifies a movie.',
    },
  },

  async getData({ inputs, state }) {
    const title = ((inputs.title as string) ?? 'Inception').trim();

    if (!title) {
      throw new Error('Please provide a movie title to search for.');
    }

    // ── 1. Fetch movie data from iTunes Search API ──────────────────
    const movie = await searchMovie(title);

    // ── 2. Watchlist state ──────────────────────────────────────────
    const watchlist = (state.watchlist as string[]) ?? [];
    const movieId = String(movie.trackId);
    const isOnWatchlist = watchlist.includes(movieId);

    // ── 3. Pick accent gradient based on genre ─────────────────────
    const accent = pickAccentFromGenre(movie.primaryGenreName);

    // ── 4. Format runtime ──────────────────────────────────────────
    const runtimeMin = Math.round(movie.trackTimeMillis / 60_000);
    const runtimeStr = runtimeMin > 0
      ? `${Math.floor(runtimeMin / 60)}h ${runtimeMin % 60}m`
      : 'N/A';

    // ── 5. Build text output for chat clients ──────────────────────
    const year = movie.releaseDate.slice(0, 4);
    let textOutput = `## ${movie.trackName} (${year})\n\n`;
    textOutput += `| | |\n|---|---|\n`;
    textOutput += `| Director | ${movie.artistName} |\n`;
    textOutput += `| Genre | ${movie.primaryGenreName} |\n`;
    textOutput += `| Runtime | ${runtimeStr} |\n`;
    textOutput += `| Rated | ${movie.contentAdvisoryRating} |\n`;
    if (movie.trackPrice > 0) {
      textOutput += `| Price | ${movie.currency} ${movie.trackPrice} |\n`;
    }
    textOutput += `\n${movie.longDescription}\n`;
    textOutput += `\n![Poster](${movie.artworkUrl100})\n`;
    textOutput += `\n[View on iTunes](${movie.trackViewUrl})\n`;

    // ── 6. Build viewModel ──────────────────────────────────────────
    // Use higher-res artwork (600x600 instead of 100x100)
    const posterUrl = movie.artworkUrl100.replace('100x100', '600x600');

    const viewModel = {
      title: movie.trackName,
      year,
      rated: movie.contentAdvisoryRating,
      runtime: runtimeStr,
      genre: movie.primaryGenreName,
      director: movie.artistName,
      plot: movie.longDescription || movie.shortDescription || 'No description available.',
      posterUrl,
      trackViewUrl: movie.trackViewUrl,
      movieId,
      accent,
      isOnWatchlist,
      watchlistCount: watchlist.length,
    };

    return {
      viewModel,
      textOutput,
      state: {
        ...state,
        lastLookup: movie.trackName,
        lookupCount: ((state.lookupCount as number) || 0) + 1,
      },
    };
  },

  actions: {
    addToWatchlist: {
      label: 'Add to Watchlist',
      description: 'Save this movie to your personal watchlist',
      inputs: {
        movieId: {
          type: 'string',
          required: true,
          description: 'iTunes track ID of the movie',
        },
      },
      async handler({ actionInputs, state }) {
        const watchlist = (state.watchlist as string[]) ?? [];
        const id = actionInputs.movieId as string;

        if (watchlist.includes(id)) {
          return { message: 'This movie is already on your watchlist.' };
        }

        watchlist.push(id);
        return {
          state: { ...state, watchlist },
          message: `Added to watchlist! (${watchlist.length} movie${watchlist.length !== 1 ? 's' : ''} total)`,
        };
      },
    },

    removeFromWatchlist: {
      label: 'Remove from Watchlist',
      description: 'Remove this movie from your watchlist',
      inputs: {
        movieId: {
          type: 'string',
          required: true,
          description: 'iTunes track ID of the movie',
        },
      },
      async handler({ actionInputs, state }) {
        const watchlist = (state.watchlist as string[]) ?? [];
        const id = actionInputs.movieId as string;
        const idx = watchlist.indexOf(id);

        if (idx < 0) {
          return { message: 'This movie is not on your watchlist.' };
        }

        watchlist.splice(idx, 1);
        return {
          state: { ...state, watchlist },
          message: `Removed from watchlist. (${watchlist.length} remaining)`,
        };
      },
    },

    showWatchlist: {
      label: 'Show Watchlist',
      description: 'Display all movies on your watchlist',
      async handler({ state }) {
        const watchlist = (state.watchlist as string[]) ?? [];
        if (watchlist.length === 0) {
          return { message: 'Your watchlist is empty.' };
        }
        return {
          message: `Your watchlist (${watchlist.length} movie${watchlist.length !== 1 ? 's' : ''}):\n${watchlist.map((id, i) => `${i + 1}. ID: ${id}`).join('\n')}`,
        };
      },
    },
  },

  template: (vm) => {
    return `
    <div style="font-family:'SF Pro Display',system-ui,-apple-system,sans-serif; max-width:400px; border-radius:20px; overflow:hidden; background:#fff; box-shadow:0 8px 32px rgba(0,0,0,0.12);">

      <!-- Hero: poster + title -->
      <div style="display:flex; gap:20px; padding:24px 24px 20px; background:${vm.accent};">
        ${vm.posterUrl ? `
        <img src="${vm.posterUrl}" alt="Poster"
             style="width:110px; height:165px; object-fit:cover; border-radius:10px; box-shadow:0 6px 20px rgba(0,0,0,0.3); flex-shrink:0;" />
        ` : `
        <div style="width:110px; height:165px; border-radius:10px; background:rgba(255,255,255,0.15); flex-shrink:0; display:flex; align-items:center; justify-content:center;">
          <span style="font-size:36px; opacity:0.6;">&#127916;</span>
        </div>
        `}
        <div style="flex:1; min-width:0; display:flex; flex-direction:column; justify-content:flex-end;">
          <div style="font-size:20px; font-weight:700; color:#fff; line-height:1.25; text-shadow:0 1px 3px rgba(0,0,0,0.2);">
            ${vm.title}
          </div>
          <div style="font-size:13px; color:rgba(255,255,255,0.85); margin-top:6px;">
            ${vm.year} &middot; ${vm.rated} &middot; ${vm.runtime}
          </div>
          <div style="font-size:12px; color:rgba(255,255,255,0.7); margin-top:4px;">
            Directed by ${vm.director}
          </div>
        </div>
      </div>

      <!-- Stats row -->
      <div style="display:flex; gap:1px; background:#f3f4f6;">
        <div style="flex:1; background:#fff; padding:12px 8px; text-align:center;">
          <div style="font-size:16px; font-weight:700; color:#1f2937;">${vm.year}</div>
          <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.05em; color:#9ca3af; margin-top:2px;">Year</div>
        </div>
        <div style="flex:1; background:#fff; padding:12px 8px; text-align:center;">
          <div style="font-size:16px; font-weight:700; color:#1f2937;">${vm.runtime}</div>
          <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.05em; color:#9ca3af; margin-top:2px;">Runtime</div>
        </div>
        <div style="flex:1; background:#fff; padding:12px 8px; text-align:center;">
          <div style="font-size:16px; font-weight:700; color:#1f2937;">${vm.rated}</div>
          <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.05em; color:#9ca3af; margin-top:2px;">Rated</div>
        </div>
      </div>

      <!-- Genre tag -->
      <div style="padding:16px 24px 12px; display:flex; gap:6px; flex-wrap:wrap;">
        <span style="display:inline-block; padding:4px 10px; border-radius:20px; font-size:11px; font-weight:500; background:#f8f9fa; color:#6b7280; border:1px solid #e5e7eb;">${vm.genre}</span>
      </div>

      <!-- Plot -->
      <div style="padding:0 24px 16px;">
        <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.05em; color:#9ca3af; margin-bottom:4px;">Plot</div>
        <div style="font-size:13px; color:#4b5563; line-height:1.5;">${(vm.plot as string).length > 300 ? (vm.plot as string).slice(0, 297) + '...' : vm.plot}</div>
      </div>

      <!-- Footer -->
      <div style="padding:12px 24px 16px; border-top:1px solid #f3f4f6; display:flex; justify-content:space-between; align-items:center;">
        <div style="display:flex; gap:8px; align-items:center;">
          ${vm.isOnWatchlist ? `
          <span style="font-size:12px; color:${colors.amber[600]}; font-weight:600; display:flex; align-items:center; gap:4px;">
            <span style="display:inline-block; width:8px; height:8px; background:${colors.amber[600]}; border-radius:50%;"></span>
            On watchlist
          </span>
          ` : `
          <span style="font-size:12px; color:#9ca3af;">
            ${vm.watchlistCount} movie${vm.watchlistCount !== 1 ? 's' : ''} on watchlist
          </span>
          `}
        </div>
        <a href="${vm.trackViewUrl}" target="_blank" rel="noopener"
           style="font-size:12px; color:#4f46e5; text-decoration:none; font-weight:500;">
          iTunes &rarr;
        </a>
      </div>
    </div>
    `;
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface ITunesMovie {
  trackId: number;
  trackName: string;
  artistName: string;
  primaryGenreName: string;
  contentAdvisoryRating: string;
  longDescription: string;
  shortDescription: string;
  releaseDate: string;
  trackTimeMillis: number;
  artworkUrl100: string;
  trackViewUrl: string;
  trackPrice: number;
  currency: string;
}

/** Search for a movie using the iTunes Search API (free, no key required) */
async function searchMovie(title: string): Promise<ITunesMovie> {
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(title)}&media=movie&limit=1`;
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`iTunes API ${res.status}: ${res.statusText}`);
    }

    const data = (await res.json()) as any;
    const results = data.results ?? [];

    if (results.length === 0) {
      throw new Error(`No movies found matching "${title}". Try a different title.`);
    }

    const m = results[0];
    return {
      trackId: m.trackId ?? 0,
      trackName: m.trackName ?? 'Unknown',
      artistName: m.artistName ?? 'Unknown',
      primaryGenreName: m.primaryGenreName ?? 'N/A',
      contentAdvisoryRating: m.contentAdvisoryRating ?? 'NR',
      longDescription: m.longDescription ?? '',
      shortDescription: m.shortDescription ?? '',
      releaseDate: m.releaseDate ?? '',
      trackTimeMillis: m.trackTimeMillis ?? 0,
      artworkUrl100: m.artworkUrl100 ?? '',
      trackViewUrl: m.trackViewUrl ?? '',
      trackPrice: m.trackPrice ?? 0,
      currency: m.currency ?? 'USD',
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[movie] ${detail}`);
    throw new Error(`Failed to search for movie: ${detail}`);
  }
}

/** Pick an accent gradient based on the primary genre */
function pickAccentFromGenre(genre: string): string {
  const g = genre.toLowerCase();

  if (g.includes('action') || g.includes('adventure')) return gradients.coral;
  if (g.includes('comedy')) return gradients.amber;
  if (g.includes('drama')) return gradients.purple;
  if (g.includes('horror') || g.includes('thriller')) return gradients.gray;
  if (g.includes('sci-fi') || g.includes('fantasy')) return gradients.blue;
  if (g.includes('romance')) return gradients.pink;
  if (g.includes('documentary')) return gradients.teal;
  if (g.includes('animation') || g.includes('family')) return gradients.green;
  if (g.includes('crime') || g.includes('mystery')) return gradients.gray;
  if (g.includes('war') || g.includes('history')) return gradients.amber;
  if (g.includes('music') || g.includes('musical')) return gradients.pink;

  return gradients.purple;
}
