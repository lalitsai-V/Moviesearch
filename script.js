
const API_KEY = '189e6712'; 
const TMDB_API_KEY = '75285ae07c57a03fe3faa13c735a4c12'; 
const TMDB_REGION = 'US'; 


const searchInput = document.getElementById('searchInput');
const searchButton = document.getElementById('searchButton');
const resultsDiv = document.getElementById('results');
const movieDetails = document.getElementById('movieDetails');
const detailsContent = document.getElementById('detailsContent');
const backButton = document.getElementById('backButton');
const addToWatchlistButton = document.getElementById('addToWatchlistButton');
const watchlistButton = document.getElementById('watchlistButton');
const watchlistDiv = document.getElementById('watchlist');
const watchlistContent = document.getElementById('watchlistContent');
const closeWatchlistButton = document.getElementById('closeWatchlistButton');
const themeToggle = document.getElementById('checkbox');
const categoryRadios = document.querySelectorAll('input[name="category"]');
const suggestionsBox = document.getElementById('suggestions');


let watchlist = JSON.parse(localStorage.getItem('watchlist')) || [];
let currentMovie = null;
let debounceTimer = null;
let activeSuggestionIndex = -1;

// The
const currentTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', currentTheme);
themeToggle.checked = currentTheme === 'dark';

// Event Listeners
searchButton.addEventListener('click', searchMovies);
searchInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        searchMovies();
    }
});
// Live search: debounce input to reduce API calls
searchInput.addEventListener('input', function() {
    const value = this.value.trim();
    clearTimeout(debounceTimer);
    if (value === '') {
        resultsDiv.innerHTML = '<div class="empty-message"><p>Search for a movie to see results here.</p></div>';
        hideSuggestions();
        return;
    }
    debounceTimer = setTimeout(() => {
        searchMovies();
        updateSuggestions();
    }, 300);
});
searchInput.addEventListener('keydown', function(e) {
    if (suggestionsBox.classList.contains('hidden')) return;
    const items = Array.from(suggestionsBox.querySelectorAll('.suggestion-item'));
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeSuggestionIndex = (activeSuggestionIndex + 1) % items.length;
        updateActiveSuggestion(items);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeSuggestionIndex = (activeSuggestionIndex - 1 + items.length) % items.length;
        updateActiveSuggestion(items);
    } else if (e.key === 'Enter') {
        if (activeSuggestionIndex >= 0 && activeSuggestionIndex < items.length) {
            e.preventDefault();
            const title = items[activeSuggestionIndex].dataset.title;
            applySuggestion(title);
        }
    } else if (e.key === 'Escape') {
        hideSuggestions();
    }
});

searchInput.addEventListener('focus', function() {
    if (this.value.trim()) updateSuggestions();
});

document.addEventListener('click', function(e) {
    if (!e.target.closest('#suggestions') && e.target !== searchInput) {
        hideSuggestions();
    }
});

backButton.addEventListener('click', showResults);
addToWatchlistButton.addEventListener('click', toggleWatchlist);
watchlistButton.addEventListener('click', showWatchlist);
closeWatchlistButton.addEventListener('click', hideWatchlist);
themeToggle.addEventListener('change', switchTheme);

// Switch theme function
function switchTheme(e) {
    if (e.target.checked) {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');
    }
}

// Search for movies
async function searchMovies() {
    const searchTerm = searchInput.value.trim();
    
    if (searchTerm === '') {
        alert('Please enter a movie title');
        return;
    }
    
    try {
        resultsDiv.innerHTML = '<div class="empty-message"><p>Loading...</p></div>';

        const selectedCategory = Array.from(categoryRadios).find(r => r.checked)?.value || 'all';

        let term = searchTerm;
        let url;

        // Map categories to OMDb search params
        if (selectedCategory === 'anime') {
            // Bias results toward anime
            term = `${searchTerm} anime`;
            url = `https://www.omdbapi.com/?s=${encodeURIComponent(term)}&apikey=${API_KEY}`;
        } else {
            url = `https://www.omdbapi.com/?s=${encodeURIComponent(term)}&apikey=${API_KEY}`;
            if (selectedCategory === 'movies') url += `&type=movie`;
            if (selectedCategory === 'tv' || selectedCategory === 'series') url += `&type=series`;
        }

        const response = await fetch(url);
        const data = await response.json();

        if (data.Response === 'False') {
            resultsDiv.innerHTML = `<div class="empty-message"><p>No results found for "${searchTerm}"</p></div>`;
            return;
        }

        let items = data.Search;

        // Filter client-side to only titles that start with the typed prefix (case-insensitive)
        const prefix = searchTerm.toLowerCase();
        items = items.filter(it => (it.Title || '').toLowerCase().startsWith(prefix));

        if (items.length === 0) {
            resultsDiv.innerHTML = `<div class="empty-message"><p>No titles starting with "${searchTerm}"</p></div>`;
            return;
        }

        // Refine Anime: fetch details and keep likely anime/animation
        if (selectedCategory === 'anime') {
            const detailed = await Promise.all(items.map(async it => {
                try {
                    const r = await fetch(`https://www.omdbapi.com/?i=${it.imdbID}&apikey=${API_KEY}`);
                    const d = await r.json();
                    const genre = (d.Genre || '').toLowerCase();
                    const title = (d.Title || '').toLowerCase();
                    const isAnime = genre.includes('animation') || genre.includes('anime') || title.includes('anime');
                    return isAnime ? it : null;
                } catch {
                    return null;
                }
            }));
            items = detailed.filter(Boolean);
            if (items.length === 0) {
                resultsDiv.innerHTML = `<div class="empty-message"><p>No anime results found for "${searchTerm}"</p></div>`;
                return;
            }
        }

        displayResults(items);
    } catch (error) {
        resultsDiv.innerHTML = '<div class="empty-message"><p>Error fetching data. Please try again later.</p></div>';
        console.error('Error fetching data:', error);
    }
}

// Display search results
function displayResults(movies) {
    resultsDiv.innerHTML = '';
    
    movies.forEach(movie => {
        const movieCard = document.createElement('div');
        movieCard.classList.add('movie-card');
        movieCard.dataset.id = movie.imdbID;

        const posterUrl = movie.Poster !== 'N/A' ? movie.Poster : 'https://via.placeholder.com/300x450?text=No+Poster';

        // Get saved rating from localStorage
        let ratings = JSON.parse(localStorage.getItem('movieRatings') || '{}');
        let savedRating = ratings[movie.imdbID] || 0;

        movieCard.innerHTML = `
            <img src="${posterUrl}" alt="${movie.Title}" class="movie-poster">
            <div class="movie-info">
                <h3 class="movie-title">${movie.Title}</h3>
                <p class="movie-year">${movie.Year}</p>
                <div class="star-rating" data-movieid="${movie.imdbID}">
                    ${[1,2,3,4,5].map(i => `<span class="star${i <= savedRating ? ' filled' : ''}" data-value="${i}">&#9733;</span>`).join('')}
                    <button class="rate-btn" data-movieid="${movie.imdbID}">Rate</button>
                </div>
            </div>
        `;

        // Add star click event
        const starContainer = movieCard.querySelector('.star-rating');
        starContainer.querySelectorAll('.star').forEach(star => {
            star.addEventListener('click', function(e) {
                e.stopPropagation();
                const value = parseInt(this.getAttribute('data-value'));
                ratings[movie.imdbID] = value;
                localStorage.setItem('movieRatings', JSON.stringify(ratings));
                // Update stars
                starContainer.querySelectorAll('.star').forEach((s, idx) => {
                    if (idx < value) s.classList.add('filled');
                    else s.classList.remove('filled');
                });
            });
        });

        // Prevent card click when clicking rate button
        starContainer.querySelector('.rate-btn').addEventListener('click', function(e) {
            e.stopPropagation();
            alert('Thank you for rating!');
        });

        movieCard.addEventListener('click', () => {
            getMovieDetails(movie.imdbID);
        });

        resultsDiv.appendChild(movieCard);
    });
    
    showResults();
}

// Get details for a specific movie
async function getMovieDetails(movieId) {
    try {
        const response = await fetch(`https://www.omdbapi.com/?i=${movieId}&plot=full&apikey=${API_KEY}`);
        const movieData = await response.json();
        
        currentMovie = movieData;
        displayMovieDetails(movieData);
        updateWatchlistButton();
    } catch (error) {
        detailsContent.innerHTML = '<p>Error fetching movie details. Please try again later.</p>';
        console.error('Error fetching movie details:', error);
    }
}

// Display movie details
function displayMovieDetails(movie) {
    const posterUrl = movie.Poster !== 'N/A' ? movie.Poster : 'https://via.placeholder.com/300x450?text=No+Poster';
    
    // Get saved rating from localStorage
    let ratings = JSON.parse(localStorage.getItem('movieRatings') || '{}');
    let savedRating = ratings[movie.imdbID] || 0;

    detailsContent.innerHTML = `
        <img src="${posterUrl}" alt="${movie.Title}" class="detail-poster">
        <h2 class="detail-title">${movie.Title} (${movie.Year})</h2>
        <div class="detail-info">
            <p><strong>Genre:</strong> ${movie.Genre}</p>
            <p><strong>Director:</strong> ${movie.Director}</p>
            <p><strong>Actors:</strong> ${movie.Actors}</p>
            <p><strong>Runtime:</strong> ${movie.Runtime}</p>
            <p><strong>Rating:</strong> ${movie.imdbRating}/10</p>
            <p><strong>Language:</strong> ${movie.Language}</p>
        </div>
        <div class="star-rating detail-star-rating" data-movieid="${movie.imdbID}">
            ${[1,2,3,4,5].map(i => `<span class="star${i <= savedRating ? ' filled' : ''}" data-value="${i}">&#9733;</span>`).join('')}
            <button class="rate-btn" data-movieid="${movie.imdbID}">Rate</button>
        </div>
        <div class="detail-plot">
            <p><strong>Plot:</strong></p>
            <p>${movie.Plot}</p>
        </div>
    `;

    // Add star click event for details
    const starContainer = detailsContent.querySelector('.detail-star-rating');
    starContainer.querySelectorAll('.star').forEach(star => {
        star.addEventListener('click', function(e) {
            e.stopPropagation();
            const value = parseInt(this.getAttribute('data-value'));
            ratings[movie.imdbID] = value;
            localStorage.setItem('movieRatings', JSON.stringify(ratings));
            // Update stars
            starContainer.querySelectorAll('.star').forEach((s, idx) => {
                if (idx < value) s.classList.add('filled');
                else s.classList.remove('filled');
            });
        });
    });
    starContainer.querySelector('.rate-btn').addEventListener('click', function(e) {
        e.stopPropagation();
        alert('Thank you for rating!');
    });
    
    // Providers section container
    const providersHost = document.createElement('div');
    providersHost.id = 'providersHost';
    detailsContent.appendChild(providersHost);

    // Fetch and render OTT providers (if TMDB key set)
    (async () => {
        if (!TMDB_API_KEY) {
            renderProvidersSection(providersHost, null);
            return;
        }
        const data = await fetchOTTProvidersByTMDB(movie.Title, movie.Year);
        renderProvidersSection(providersHost, data);
    })();

    showDetails();
}

// Toggle movie in watchlist
function toggleWatchlist() {
    if (!currentMovie) return;
    
    const index = watchlist.findIndex(movie => movie.imdbID === currentMovie.imdbID);
    
    if (index === -1) {
        // Add to watchlist
        watchlist.push({
            imdbID: currentMovie.imdbID,
            Title: currentMovie.Title,
            Year: currentMovie.Year,
            Poster: currentMovie.Poster
        });
        addToWatchlistButton.innerHTML = '<i class="fas fa-check"></i> Added to Watchlist';
        addToWatchlistButton.classList.add('added');
    } else {
        // Remove from watchlist
        watchlist.splice(index, 1);
        addToWatchlistButton.innerHTML = '<i class="fas fa-bookmark"></i> Add to Watchlist';
        addToWatchlistButton.classList.remove('added');
    }
    
    // Save to localStorage
    localStorage.setItem('watchlist', JSON.stringify(watchlist));
}

// Update watchlist button based on current movie
function updateWatchlistButton() {
    if (!currentMovie) return;
    
    const isInWatchlist = watchlist.some(movie => movie.imdbID === currentMovie.imdbID);
    
    if (isInWatchlist) {
        addToWatchlistButton.innerHTML = '<i class="fas fa-check"></i> Added to Watchlist';
        addToWatchlistButton.classList.add('added');
    } else {
        addToWatchlistButton.innerHTML = '<i class="fas fa-bookmark"></i> Add to Watchlist';
        addToWatchlistButton.classList.remove('added');
    }
}

// Show watchlist
function showWatchlist() {
    renderWatchlist();
    resultsDiv.classList.add('hidden');
    movieDetails.classList.add('hidden');
    watchlistDiv.classList.remove('hidden');
}

// Hide watchlist
function hideWatchlist() {
    watchlistDiv.classList.add('hidden');
    
    if (!movieDetails.classList.contains('hidden')) {
        showDetails();
    } else {
        showResults();
    }
}

// Render watchlist items
function renderWatchlist() {
    if (watchlist.length === 0) {
        watchlistContent.innerHTML = `<div class="empty-message">Your watchlist is empty. Add movies to watch later!</div>`;
        return;
    }
    
    watchlistContent.innerHTML = '';
    
    watchlist.forEach(movie => {
        const movieCard = document.createElement('div');
        movieCard.classList.add('movie-card', 'watchlist-item');
        
        const posterUrl = movie.Poster !== 'N/A' ? movie.Poster : 'https://via.placeholder.com/300x450?text=No+Poster';
        
        movieCard.innerHTML = `
            <button class="remove-btn" data-id="${movie.imdbID}"><i class="fas fa-times"></i></button>
            <img src="${posterUrl}" alt="${movie.Title}" class="movie-poster">
            <div class="movie-info">
                <h3 class="movie-title">${movie.Title}</h3>
                <p class="movie-year">${movie.Year}</p>
            </div>
        `;
        
        // Add click event to movie card
        movieCard.addEventListener('click', (e) => {
            // Prevent triggering on remove button
            if (!e.target.closest('.remove-btn')) {
                getMovieDetails(movie.imdbID);
            }
        });
        
        watchlistContent.appendChild(movieCard);
    });
    
    // Add event listeners to remove buttons
    document.querySelectorAll('.remove-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            removeFromWatchlist(button.dataset.id);
        });
    });
}

// Remove from watchlist
function removeFromWatchlist(id) {
    watchlist = watchlist.filter(movie => movie.imdbID !== id);
    localStorage.setItem('watchlist', JSON.stringify(watchlist));
    
    // Update the button if the current movie is the one being removed
    if (currentMovie && currentMovie.imdbID === id) {
        updateWatchlistButton();
    }
    
    renderWatchlist();
}

// Show results, hide details
function showResults() {
    resultsDiv.classList.remove('hidden');
    movieDetails.classList.add('hidden');
    watchlistDiv.classList.add('hidden');
}

// Show details, hide results
function showDetails() {
    resultsDiv.classList.add('hidden');
    movieDetails.classList.remove('hidden');
    watchlistDiv.classList.add('hidden');
    window.scrollTo(0, 0);
}

// Initialize the page
function init() {
    // Add placeholder text for empty results
    if (resultsDiv.innerHTML === '') {
        resultsDiv.innerHTML = '<div class="empty-message"><p>Search for a movie to see results here.</p></div>';
    }
}

init();
categoryRadios.forEach(radio => {
    radio.addEventListener('change', () => {
        if (searchInput.value.trim()) searchMovies();
    });
});

function updateActiveSuggestion(items) {
    items.forEach((el, idx) => {
        if (idx === activeSuggestionIndex) el.classList.add('active');
        else el.classList.remove('active');
    });
}

function hideSuggestions() {
    suggestionsBox.classList.add('hidden');
    suggestionsBox.innerHTML = '';
    activeSuggestionIndex = -1;
}

function showSuggestions(list) {
    if (!list || list.length === 0) {
        hideSuggestions();
        return;
    }
    suggestionsBox.innerHTML = list.map(title => `
        <div class="suggestion-item" data-title="${title.replace(/"/g, '&quot;')}">${title}</div>
    `).join('');
    suggestionsBox.classList.remove('hidden');
    activeSuggestionIndex = -1;
    Array.from(suggestionsBox.querySelectorAll('.suggestion-item')).forEach(el => {
        el.addEventListener('click', () => applySuggestion(el.dataset.title));
    });
}

function applySuggestion(title) {
    searchInput.value = title;
    hideSuggestions();
    searchMovies();
}

async function updateSuggestions() {
    const q = searchInput.value.trim();
    if (!q) {
        hideSuggestions();
        return;
    }
    try {
        const selectedCategory = Array.from(categoryRadios).find(r => r.checked)?.value || 'all';
        let url = `https://www.omdbapi.com/?s=${encodeURIComponent(q)}&apikey=${API_KEY}`;
        if (selectedCategory === 'movies') url += `&type=movie`;
        if (selectedCategory === 'tv' || selectedCategory === 'series') url += `&type=series`;

        const resp = await fetch(url);
        const data = await resp.json();
        if (data.Response === 'False' || !data.Search) {
            hideSuggestions();
            return;
        }
        const prefix = q.toLowerCase();
        const titles = data.Search
            .map(it => it.Title)
            .filter(t => (t || '').toLowerCase().startsWith(prefix));

        const unique = Array.from(new Set(titles)).slice(0, 10);
        showSuggestions(unique);
    } catch (e) {
        hideSuggestions();
        console.error('Suggestion error:', e);
    }
}

async function fetchOTTProvidersByTMDB(title, year) {
    if (!TMDB_API_KEY) return null;
    try {
        const searchUrl = `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}${year ? `&year=${encodeURIComponent(year)}` : ''}`;
        const sr = await fetch(searchUrl);
        const sdata = await sr.json();
        if (!sdata?.results?.length) return null;

        // Pick best match
        const match = sdata.results[0];
        const mediaType = match.media_type === 'tv' ? 'tv' : 'movie';
        const id = match.id;

        const provUrl = `https://api.themoviedb.org/3/${mediaType}/${id}/watch/providers?api_key=${TMDB_API_KEY}`;
        const pr = await fetch(provUrl);
        const pdata = await pr.json();
        const region = pdata?.results?.[TMDB_REGION];
        if (!region) return null;

        // Gather types we care about in priority order
        const sections = [
            { key: 'flatrate', label: 'Stream' },
            { key: 'ads', label: 'Stream (with ads)' },
            { key: 'free', label: 'Free' },
            { key: 'rent', label: 'Rent' },
            { key: 'buy', label: 'Buy' }
        ];

        const out = [];
        for (const s of sections) {
            const items = region[s.key];
            if (Array.isArray(items) && items.length) {
                out.push({
                    label: s.label,
                    providers: items.map(p => ({
                        name: p.provider_name,
                        logo: p.logo_path ? `https://image.tmdb.org/t/p/w45${p.logo_path}` : null
                    }))
                });
            }
        }
        return out.length ? out : null;
    } catch (e) {
        console.error('TMDB providers error:', e);
        return null;
    }
}

function renderProvidersSection(container, providers) {
    const section = document.createElement('div');
    section.className = 'providers-section';
    section.innerHTML = `
        <h3 class="providers-title">Where to watch</h3>
        <div class="providers-wrap"></div>
    `;
    const wrap = section.querySelector('.providers-wrap');

    if (!providers || !providers.length) {
        wrap.innerHTML = `<div class="provider-empty">No streaming information available for ${TMDB_REGION}.</div>`;
        container.appendChild(section);
        return;
    }

    providers.forEach(group => {
        const groupEl = document.createElement('div');
        groupEl.className = 'provider-group';
        groupEl.innerHTML = `<div class="provider-group-title">${group.label}</div>`;
        const list = document.createElement('div');
        list.className = 'provider-list';
        group.providers.forEach(p => {
            const chip = document.createElement('div');
            chip.className = 'provider-chip';
            chip.innerHTML = `
                ${p.logo ? `<img src="${p.logo}" alt="${p.name}" class="provider-logo">` : ''}
                <span class="provider-name">${p.name}</span>
            `;
            list.appendChild(chip);
        });
        groupEl.appendChild(list);
        wrap.appendChild(groupEl);
    });

    container.appendChild(section);
}