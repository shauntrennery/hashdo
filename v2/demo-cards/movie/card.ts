import { defineCard, colors, gradients } from '@hashdo/core';

/**
 * #do/movie — Movie lookup card with poster, ratings, and watchlist.
 *
 * Search by title using the TMDB API (free, requires API key from themoviedb.org).
 * Shows poster, rating, director, cast, plot, genre, and runtime.
 * Users can maintain a personal watchlist with stateful actions.
 */
export default defineCard({
  name: 'do-movie',
  shareable: true,

  stateKey: (_inputs, userId) => (userId ? `user:${userId}` : undefined),

  description:
    'Look up any movie by title. Shows poster, rating, director, cast, plot, genre, and runtime. ' +
    'Requires a TMDB API key (free at https://www.themoviedb.org/settings/api). ' +
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
        'TMDB API key (v3 auth). Get a free key at https://www.themoviedb.org/settings/api',
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
        'A TMDB API key is required. Get a free key at https://www.themoviedb.org/settings/api and pass it as the apiKey parameter.',
      );
    }

    // ── 1. Fetch movie data from TMDB ─────────────────────────────
    const movie = await fetchMovie(title, year, apiKey);

    // ── 2. Watchlist state ──────────────────────────────────────────
    const watchlist = (state.watchlist as string[]) ?? [];
    const movieId = String(movie.id);
    const isOnWatchlist = watchlist.includes(movieId);

    // ── 3. Pick accent gradient based on genre ─────────────────────
    const primaryGenre = movie.genres[0] ?? 'Drama';
    const accent = pickAccentFromGenre(primaryGenre);

    // ── 4. Format runtime ──────────────────────────────────────────
    const runtimeStr = movie.runtime > 0
      ? `${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m`
      : 'N/A';

    // ── 5. Build text output for chat clients ──────────────────────
    const releaseYear = movie.releaseDate.slice(0, 4);
    let textOutput = `## ${movie.title} (${releaseYear})\n\n`;
    textOutput += `| | |\n|---|---|\n`;
    if (movie.director) {
      textOutput += `| Director | ${movie.director} |\n`;
    }
    if (movie.cast.length > 0) {
      textOutput += `| Cast | ${movie.cast.join(', ')} |\n`;
    }
    textOutput += `| Genre | ${movie.genres.join(', ')} |\n`;
    textOutput += `| Runtime | ${runtimeStr} |\n`;
    if (movie.voteAverage > 0) {
      textOutput += `| TMDB Rating | ${movie.voteAverage.toFixed(1)}/10 |\n`;
    }
    textOutput += `\n${movie.overview}\n`;
    if (movie.posterPath) {
      textOutput += `\n![Poster](https://image.tmdb.org/t/p/w500${movie.posterPath})\n`;
    }
    textOutput += `\n[View on TMDB](https://www.themoviedb.org/movie/${movie.id})\n`;

    // ── 6. Build viewModel ──────────────────────────────────────────
    const viewModel = {
      title: movie.title,
      year: releaseYear,
      runtime: runtimeStr,
      genres: movie.genres,
      director: movie.director || 'Unknown',
      cast: movie.cast.join(', ') || 'Unknown',
      plot: movie.overview || 'No description available.',
      posterUrl: movie.posterPath
        ? `https://image.tmdb.org/t/p/w500${movie.posterPath}`
        : null,
      rating: movie.voteAverage > 0 ? movie.voteAverage.toFixed(1) : null,
      tmdbUrl: `https://www.themoviedb.org/movie/${movie.id}`,
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
        lastLookup: movie.title,
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
          description: 'TMDB movie ID',
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
          description: 'TMDB movie ID',
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
          message: `Your watchlist (${watchlist.length} movie${watchlist.length !== 1 ? 's' : ''}):\n${watchlist.map((id, i) => `${i + 1}. https://www.themoviedb.org/movie/${id}`).join('\n')}`,
        };
      },
    },
  },

  template: (vm) => {
    const genres = vm.genres as string[];

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
            ${vm.year} &middot; ${vm.runtime}
          </div>
          <div style="font-size:12px; color:rgba(255,255,255,0.7); margin-top:4px;">
            Directed by ${vm.director}
          </div>
        </div>
      </div>

      <!-- Rating row -->
      <div style="display:flex; gap:1px; background:#f3f4f6;">
        ${vm.rating ? `
        <div style="flex:1; background:#fff; padding:12px 8px; text-align:center;">
          <div style="font-size:18px; font-weight:700; color:${colors.amber[600]};">${vm.rating}</div>
          <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.05em; color:#9ca3af; margin-top:2px;">TMDB</div>
        </div>
        ` : `
        <div style="flex:1; background:#fff; padding:12px 8px; text-align:center;">
          <div style="font-size:14px; color:#9ca3af;">No rating available</div>
        </div>
        `}
      </div>

      <!-- Genre tags -->
      <div style="padding:16px 24px 12px; display:flex; gap:6px; flex-wrap:wrap;">
        ${genres.map((g: string) => `<span style="display:inline-block; padding:4px 10px; border-radius:20px; font-size:11px; font-weight:500; background:#f8f9fa; color:#6b7280; border:1px solid #e5e7eb;">${g}</span>`).join('')}
      </div>

      <!-- Cast -->
      <div style="padding:0 24px 12px;">
        <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.05em; color:#9ca3af; margin-bottom:4px;">Cast</div>
        <div style="font-size:13px; color:#374151; line-height:1.4;">${vm.cast}</div>
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
        <a href="${vm.tmdbUrl}" target="_blank" rel="noopener"
           style="font-size:12px; color:#4f46e5; text-decoration:none; font-weight:500;">
          TMDB &rarr;
        </a>
      </div>
    </div>
    `;
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface TmdbMovie {
  id: number;
  title: string;
  overview: string;
  releaseDate: string;
  runtime: number;
  genres: string[];
  director: string | null;
  cast: string[];
  posterPath: string | null;
  voteAverage: number;
}

/** Fetch a movie from the TMDB API by title */
async function fetchMovie(
  title: string,
  year: string,
  apiKey: string,
): Promise<TmdbMovie> {
  try {
    // Step 1: Search for the movie
    let searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${encodeURIComponent(apiKey)}&query=${encodeURIComponent(title)}`;
    if (year) {
      searchUrl += `&year=${encodeURIComponent(year)}`;
    }

    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) {
      throw new Error(`TMDB API ${searchRes.status}: ${searchRes.statusText}`);
    }

    const searchData = (await searchRes.json()) as any;
    const results = searchData.results ?? [];

    if (results.length === 0) {
      throw new Error(`No movies found matching "${title}". Try a different title.`);
    }

    const movieId = results[0].id;

    // Step 2: Get full details with credits
    const detailUrl = `https://api.themoviedb.org/3/movie/${movieId}?api_key=${encodeURIComponent(apiKey)}&append_to_response=credits`;
    const detailRes = await fetch(detailUrl);

    if (!detailRes.ok) {
      throw new Error(`TMDB API ${detailRes.status}: ${detailRes.statusText}`);
    }

    const d = (await detailRes.json()) as any;

    const director = d.credits?.crew?.find(
      (c: any) => c.job === 'Director',
    )?.name ?? null;

    const cast = (d.credits?.cast ?? [])
      .slice(0, 5)
      .map((c: any) => c.name as string);

    const genres = (d.genres ?? []).map((g: any) => g.name as string);

    return {
      id: d.id,
      title: d.title ?? 'Unknown',
      overview: d.overview ?? '',
      releaseDate: d.release_date ?? '',
      runtime: d.runtime ?? 0,
      genres,
      director,
      cast,
      posterPath: d.poster_path ?? null,
      voteAverage: d.vote_average ?? 0,
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
