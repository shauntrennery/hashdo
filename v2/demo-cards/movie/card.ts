import { defineCard, colors, gradients } from '@hashdo/core';

/**
 * #do/movie — Movie lookup card with poster, ratings, and watchlist.
 *
 * Search by title using the OMDB API (free tier, requires API key from omdbapi.com).
 * Shows poster, IMDb rating, director, cast, plot, genre, and runtime.
 * Users can maintain a personal watchlist with stateful actions.
 */
export default defineCard({
  name: 'do-movie',
  shareable: true,

  stateKey: (_inputs, userId) => (userId ? `user:${userId}` : undefined),

  description:
    'Look up any movie by title. Shows poster, IMDb rating, director, cast, plot, genre, and runtime. ' +
    'Requires an OMDB API key (free at https://www.omdbapi.com/apikey.aspx). ' +
    'All parameters have defaults — call this tool immediately without asking the user for parameters.',

  inputs: {
    title: {
      type: 'string',
      required: false,
      default: 'Inception',
      description:
        'Movie title to search for. Has a sensible default — only override if the user specifies a movie.',
    },
    year: {
      type: 'string',
      required: false,
      default: '',
      description:
        'Optional release year to narrow results (e.g. "2010"). Leave empty for best match.',
    },
    apiKey: {
      type: 'string',
      required: false,
      default: '',
      sensitive: true,
      description:
        'OMDB API key. Get a free key at https://www.omdbapi.com/apikey.aspx',
    },
  },

  async getData({ inputs, state }) {
    const title = ((inputs.title as string) ?? 'Inception').trim();
    const year = ((inputs.year as string) ?? '').trim();
    const apiKey = ((inputs.apiKey as string) ?? '').trim();

    if (!title) {
      throw new Error('Please provide a movie title to search for.');
    }

    if (!apiKey) {
      throw new Error(
        'An OMDB API key is required. Get a free key at https://www.omdbapi.com/apikey.aspx and pass it as the apiKey parameter.',
      );
    }

    // ── 1. Fetch movie data from OMDB ───────────────────────────────
    const movie = await fetchMovie(title, year, apiKey);

    // ── 2. Watchlist state ──────────────────────────────────────────
    const watchlist = (state.watchlist as string[]) ?? [];
    const movieId = movie.imdbID;
    const isOnWatchlist = watchlist.includes(movieId);

    // ── 3. Pick accent gradient based on genre ─────────────────────
    const accent = pickAccentFromGenre(movie.Genre);

    // ── 4. Build text output for chat clients ──────────────────────
    let textOutput = `## ${movie.Title} (${movie.Year})\n\n`;
    textOutput += `| | |\n|---|---|\n`;
    textOutput += `| Director | ${movie.Director} |\n`;
    textOutput += `| Cast | ${movie.Actors} |\n`;
    textOutput += `| Genre | ${movie.Genre} |\n`;
    textOutput += `| Runtime | ${movie.Runtime} |\n`;
    textOutput += `| Rated | ${movie.Rated} |\n`;
    if (movie.imdbRating !== 'N/A') {
      textOutput += `| IMDb Rating | ${movie.imdbRating}/10 |\n`;
    }
    if (movie.RottenTomatoesRating) {
      textOutput += `| Rotten Tomatoes | ${movie.RottenTomatoesRating} |\n`;
    }
    textOutput += `\n${movie.Plot}\n`;
    if (movie.Poster !== 'N/A') {
      textOutput += `\n![Poster](${movie.Poster})\n`;
    }
    textOutput += `\n[View on IMDb](https://www.imdb.com/title/${movie.imdbID}/)\n`;

    // ── 5. Build viewModel ──────────────────────────────────────────
    const viewModel = {
      title: movie.Title,
      year: movie.Year,
      rated: movie.Rated,
      runtime: movie.Runtime,
      genre: movie.Genre,
      director: movie.Director,
      actors: movie.Actors,
      plot: movie.Plot,
      posterUrl: movie.Poster !== 'N/A' ? movie.Poster : null,
      imdbRating: movie.imdbRating !== 'N/A' ? movie.imdbRating : null,
      rottenTomatoes: movie.RottenTomatoesRating,
      imdbUrl: `https://www.imdb.com/title/${movie.imdbID}/`,
      imdbID: movie.imdbID,
      accent,
      isOnWatchlist,
      watchlistCount: watchlist.length,
    };

    return {
      viewModel,
      textOutput,
      state: {
        ...state,
        lastLookup: movie.Title,
        lookupCount: ((state.lookupCount as number) || 0) + 1,
      },
    };
  },

  actions: {
    addToWatchlist: {
      label: 'Add to Watchlist',
      description: 'Save this movie to your personal watchlist',
      inputs: {
        imdbID: {
          type: 'string',
          required: true,
          description: 'IMDb ID of the movie (e.g. tt1375666)',
        },
      },
      async handler({ actionInputs, state }) {
        const watchlist = (state.watchlist as string[]) ?? [];
        const id = actionInputs.imdbID as string;

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
        imdbID: {
          type: 'string',
          required: true,
          description: 'IMDb ID of the movie',
        },
      },
      async handler({ actionInputs, state }) {
        const watchlist = (state.watchlist as string[]) ?? [];
        const id = actionInputs.imdbID as string;
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
          message: `Your watchlist (${watchlist.length} movie${watchlist.length !== 1 ? 's' : ''}):\n${watchlist.map((id, i) => `${i + 1}. https://www.imdb.com/title/${id}/`).join('\n')}`,
        };
      },
    },
  },

  template: (vm) => {
    const genres = (vm.genre as string)
      .split(',')
      .map((g: string) => g.trim())
      .filter(Boolean);

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

      <!-- Ratings row -->
      <div style="display:flex; gap:1px; background:#f3f4f6;">
        ${vm.imdbRating ? `
        <div style="flex:1; background:#fff; padding:12px 8px; text-align:center;">
          <div style="font-size:18px; font-weight:700; color:${colors.amber[600]};">${vm.imdbRating}</div>
          <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.05em; color:#9ca3af; margin-top:2px;">IMDb</div>
        </div>
        ` : ''}
        ${vm.rottenTomatoes ? `
        <div style="flex:1; background:#fff; padding:12px 8px; text-align:center;">
          <div style="font-size:18px; font-weight:700; color:${colors.red[600]};">${vm.rottenTomatoes}</div>
          <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.05em; color:#9ca3af; margin-top:2px;">Rotten Tomatoes</div>
        </div>
        ` : ''}
        ${!vm.imdbRating && !vm.rottenTomatoes ? `
        <div style="flex:1; background:#fff; padding:12px 8px; text-align:center;">
          <div style="font-size:14px; color:#9ca3af;">No ratings available</div>
        </div>
        ` : ''}
      </div>

      <!-- Genre tags -->
      <div style="padding:16px 24px 12px; display:flex; gap:6px; flex-wrap:wrap;">
        ${genres.map((g: string) => `<span style="display:inline-block; padding:4px 10px; border-radius:20px; font-size:11px; font-weight:500; background:#f8f9fa; color:#6b7280; border:1px solid #e5e7eb;">${g}</span>`).join('')}
      </div>

      <!-- Cast -->
      <div style="padding:0 24px 12px;">
        <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.05em; color:#9ca3af; margin-bottom:4px;">Cast</div>
        <div style="font-size:13px; color:#374151; line-height:1.4;">${vm.actors}</div>
      </div>

      <!-- Plot -->
      <div style="padding:0 24px 16px;">
        <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.05em; color:#9ca3af; margin-bottom:4px;">Plot</div>
        <div style="font-size:13px; color:#4b5563; line-height:1.5;">${vm.plot}</div>
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
        <a href="${vm.imdbUrl}" target="_blank" rel="noopener"
           style="font-size:12px; color:#4f46e5; text-decoration:none; font-weight:500;">
          IMDb &rarr;
        </a>
      </div>
    </div>
    `;
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface OmdbMovie {
  Title: string;
  Year: string;
  Rated: string;
  Runtime: string;
  Genre: string;
  Director: string;
  Actors: string;
  Plot: string;
  Poster: string;
  imdbRating: string;
  imdbID: string;
  RottenTomatoesRating: string | null;
}

/** Fetch a movie from the OMDB API by title */
async function fetchMovie(
  title: string,
  year: string,
  apiKey: string,
): Promise<OmdbMovie> {
  try {
    let url = `https://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=${encodeURIComponent(apiKey)}&plot=short`;
    if (year) {
      url += `&y=${encodeURIComponent(year)}`;
    }

    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`OMDB API ${res.status}: ${res.statusText}`);
    }

    const data = (await res.json()) as any;

    if (data.Response === 'False') {
      throw new Error(data.Error || `No movie found matching "${title}"`);
    }

    // Extract Rotten Tomatoes rating from Ratings array
    const rtRating =
      data.Ratings?.find(
        (r: any) => r.Source === 'Rotten Tomatoes',
      )?.Value ?? null;

    return {
      Title: data.Title ?? 'Unknown',
      Year: data.Year ?? 'Unknown',
      Rated: data.Rated ?? 'N/A',
      Runtime: data.Runtime ?? 'N/A',
      Genre: data.Genre ?? 'N/A',
      Director: data.Director ?? 'Unknown',
      Actors: data.Actors ?? 'Unknown',
      Plot: data.Plot ?? 'No plot available.',
      Poster: data.Poster ?? 'N/A',
      imdbRating: data.imdbRating ?? 'N/A',
      imdbID: data.imdbID ?? '',
      RottenTomatoesRating: rtRating,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[movie] ${detail}`);
    throw new Error(`Failed to fetch movie data: ${detail}`);
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
