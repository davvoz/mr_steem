// At the top of the file
const routes = {
    '/': { 
        viewId: 'home-view',
        handler: async () => {
            hideAllViews();
            showView('home-view');
            if (steemConnection) {
                await loadSteemPosts();
                await loadStories();
            }
        }
    },
    '/explore': { 
        viewId: 'explore-view',
        handler: async () => {
            hideAllViews();
            showView('explore-view');
            if (steemConnection) {
                await loadExploreContent();
            }
        }
    },
    '/activity': { 
        viewId: 'activity-view',
        handler: () => {
            hideAllViews();
            showView('activity-view');
            showLikedPosts();
        }
    },
    '/profile': { 
        viewId: 'profile-view',
        handler: async () => {
            hideAllViews();
            showView('profile-view');
            if (steemConnection) {
                await loadUserProfile();
                await showMyPosts();
            }
        }
    }
};

// Add these helper functions
function hideAllViews() {
    document.querySelectorAll('.view').forEach(view => {
        view.style.display = 'none';
    });
}

function showView(viewId) {
    const view = document.getElementById(viewId);
    if (view) {
        view.style.display = 'block';
    }
}

// Add this function to update nav profile image
function updateNavProfileImage(profileImg) {
    const navProfileImg = document.querySelector('.nav-profile-image img');
    if (navProfileImg) {
        navProfileImg.src = profileImg;
    }
}

// Update the DOMContentLoaded listener
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded');
    window.router = new Router(routes);
    
    // Update navigation event listeners with more logging
    const navIcons = document.querySelectorAll('.nav-icons i');
    console.log('Found nav icons:', navIcons.length);
    
    navIcons.forEach(icon => {
        console.log('Adding click listener to:', icon.dataset.route);
        icon.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('CLICK EVENT FIRED!');
            console.log('Clicked icon route:', icon.dataset.route);
            console.log('Steem connection status:', steemConnection);
            
            if (!steemConnection && icon.dataset.route !== '/') {
                console.log('Navigation blocked - not connected to Steem');
                alert('Please connect to Steem first');
                return;
            }

            console.log('Proceeding with navigation to:', icon.dataset.route);
            window.router.navigate(icon.dataset.route);
            
            // Update active state
            document.querySelectorAll('.nav-icons i').forEach(i => i.classList.remove('active'));
            icon.classList.add('active');
        });
    });

    // Add click handler for profile image
    const navProfileImage = document.querySelector('.nav-profile-image');
    if (navProfileImage) {
        console.log('Adding click listener to profile image');
        navProfileImage.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('Profile image clicked');
            
            if (!steemConnection) {
                console.log('Navigation blocked - not connected to Steem');
                alert('Please connect to Steem first');
                return;
            }

            console.log('Navigating to profile');
            window.router.navigate('/profile');
            
            // Update active state
            document.querySelectorAll('.nav-icons i, .nav-profile-image').forEach(el => el.classList.remove('active'));
            navProfileImage.classList.add('active');
        });
    }

    // ... rest of your existing initialization code ...
});

// Ensure steem is defined
if (typeof steem === 'undefined') {
    console.warn('Primary Steem CDN failed, trying fallback...');
    const fallbackScript = document.createElement('script');
    fallbackScript.src = 'https://unpkg.com/steem/dist/steem.min.js';
    fallbackScript.onerror = () => {
        console.error('All Steem CDN sources failed');
        document.getElementById('steem-status').style.display = 'block';
        document.getElementById('steem-status').innerHTML = 
            '<strong style="color: red;">Error: Failed to load Steem library</strong>';
    };
    document.head.appendChild(fallbackScript);
}

let steemConnection = null;
let steemUsername = null;
const avatarCache = new Map(); // Cache per gli avatar

// Sostituisci la funzione getSteemProfileImage con questa versione ottimizzata
function getSteemProfileImage(account) {
    //const defaultAvatar = 'https://steemitimages.com/u/default-user/avatar';
    //usiamo un icona material
    const defaultAvatar = 'https://material.io/resources/icons/static/icons/baseline-account_circle-24px.svg';
    try {
        console.log('Processing account:*****************', account);
        if (!account || !account.json_metadata) return defaultAvatar;
        
        let metadata = account.json_metadata;
        if (typeof metadata === 'string') {
           // try {
                metadata = JSON.parse(metadata);
                //se metadata.profile.profile_image non esiste, proviamo con posting_json_metadata.profile.profile_image
                if (!metadata.profile || !metadata.profile.profile_image) {
                    metadata = JSON.parse(account.posting_json_metadata);
                }
        }
        
        console.log('Parsed metadata for', account.name, ':', metadata);
        return metadata.profile && metadata.profile.profile_image ? metadata.profile.profile_image : defaultAvatar;
        
    } catch (e) {
        console.warn('Error parsing profile data for', account.name, ':', e);
        return defaultAvatar;
    }
}

// Semplifichiamo preloadAvatars per usare direttamente l'URL dell'avatar
async function preloadAvatars(accounts) {    
    accounts.forEach(account => {
        console.log(account);
        if (!avatarCache.has(account.name)) {
            const profileImg = getSteemProfileImage(account);
            avatarCache.set(account.name, profileImg);
        }
    });
}

// Modifica la funzione loadSteemPosts
async function loadSteemPosts() {
    try {
        const query = {
            tag: 'instaclone',
            limit: 20
        };
        const posts = await steem.api.getDiscussionsByCreatedAsync(query);
        
        // Preload all avatars at once
        const uniqueAuthors = [...new Set(posts.map(post => post.author))];
        const authorAccounts = await steem.api.getAccountsAsync(uniqueAuthors);
        await preloadAvatars(authorAccounts);
        
        renderPosts(posts);
    } catch (error) {
        console.error('Failed to load posts:', error);
        document.getElementById('posts-container').innerHTML = 
            '<div class="post">Error loading posts from Steem</div>';
    }
}

// Modifica la funzione loadStories
async function loadStories() {
    if (!steemUsername) return;
    try {
        const following = await steem.api.getFollowingAsync(steemUsername, '', 'blog', 10);
        const followingAccounts = await steem.api.getAccountsAsync(following.map(f => f.following));
        
        // Preload avatars for stories
        await preloadAvatars(followingAccounts);
        
        const storiesContainer = document.getElementById('stories-container');
        storiesContainer.innerHTML = followingAccounts.map(account => `
            <div class="story" onclick="viewStory('${account.name}')">
                <div class="story-avatar">
                    <div class="story-avatar-inner">
                        <img src="${avatarCache.get(account.name)}" 
                             style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;"
                            ">
                    </div>
                </div>
                <span>${account.name}</span>
            </div>
        `).join('');
    } catch (error) {
        console.error('Failed to load stories:', error);
    }
}

// Add these new functions after the existing loadStories function
async function checkIfVoted(author, permlink) {
    try {
        const activeVotes = await steem.api.getActiveVotesAsync(author, permlink);
        return activeVotes.some(vote => vote.voter === steemUsername);
    } catch (error) {
        console.error('Failed to check vote status:', error);
        return false;
    }
}

async function showVoters(author, permlink, element) {
    try {
        const activeVotes = await steem.api.getActiveVotesAsync(author, permlink);
        const votersList = activeVotes.map(vote => 
            `${vote.voter} (${(vote.percent / 100).toFixed(0)}%)`
        ).join('\n');
        
        if (votersList) {
            element.setAttribute('title', votersList);
        } else {
            element.setAttribute('title', 'No votes yet');
        }
    } catch (error) {
        console.error('Failed to fetch voters:', error);
    }
}

// Replace the existing renderPosts function with this updated version
async function renderPosts(steemPosts) {
    const container = document.getElementById('posts-container');
    container.innerHTML = '';

    for (const post of steemPosts) {
        const postElement = document.createElement('div');
        postElement.className = 'post';
        
        const imgRegex = /<img[^>]+src="([^">]+)"/;
        const imgMatch = post.body.match(imgRegex);
        const imageUrl = imgMatch ? imgMatch[1] : 'https://via.placeholder.com/500';
        const avatarUrl = avatarCache.get(post.author);
        
        // Check if the current user has voted on this post
        const hasVoted = await checkIfVoted(post.author, post.permlink);
        const heartClass = hasVoted ? 'fas fa-heart text-danger' : 'far fa-heart';

        postElement.innerHTML = `
            <div class="post-header">
                <div class="avatar">
                    <img src="${avatarUrl}" 
                         style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">
                </div>
                <div>${post.author}</div>
            </div>
            <div class="post-image">
                <img src="${imageUrl}" style="max-width: 100%; max-height: 500px; object-fit: cover;">
            </div>
            <div class="post-actions">
                <i class="${heartClass} like-animation" 
                   onclick="votePost('${post.author}', '${post.permlink}')"
                   data-author="${post.author}"
                   data-permlink="${post.permlink}"></i>
                <i class="far fa-comment"></i>
                <span class="votes-count" style="cursor: pointer;">${post.net_votes} votes</span>
                <span>${post.pending_payout_value}</span>
            </div>
            <div class="post-description">
                <p><strong>${post.author}</strong> ${post.title}</p>
                <small>${new Date(post.created).toLocaleDateString()}</small>
            </div>
        `;

        container.appendChild(postElement);
        
        // Add voters list to the votes count element
        const votesCountElement = postElement.querySelector('.votes-count');
        showVoters(post.author, post.permlink, votesCountElement);
    }
}

async function createNewPost() {
    if (!steemConnection || !steemUsername) {
        alert('Please connect to Steem first');
        return;
    }

    const title = prompt('Enter post title:');
    const description = prompt('Enter your post description:');
    const imageUrl = prompt('Enter image URL:');
    
    if (!title || !description) return;

    try {
        const permlink = 'instaclone-' + Date.now();
        const body = `
${description}

![Post Image](${imageUrl})

Posted via InstaClone
`;
        const operations = [
            ['comment',
                {
                    parent_author: '',
                    parent_permlink: 'instaclone',
                    author: steemUsername,
                    permlink: permlink,
                    title: title,
                    body: body,
                    json_metadata: JSON.stringify({
                        tags: ['instaclone', 'photo', 'social'],
                        app: 'instaclone/1.0',
                        image: [imageUrl]
                    })
                }
            ]
        ];

        const key = sessionStorage.getItem('steemPostingKey');
        if (!key) {
            throw new Error('Posting key required');
        }

        await steem.broadcast.sendAsync(
            { operations: operations, extensions: [] },
            { posting: key }
        );

        alert('Posted successfully to Steem!');
        loadSteemPosts(); // Reload posts
    } catch (error) {
        console.error('Failed to post:', error);
        alert('Failed to post: ' + error.message);
    }
}

// Update the existing votePost function
async function votePost(author, permlink) {
    if (!steemConnection || !steemUsername) {
        alert('Please connect to Steem first');
        return;
    }

    try {
        const key = sessionStorage.getItem('steemPostingKey');
        if (!key) {
            throw new Error('Posting key required');
        }

        const postElement = document.querySelector(`[data-author="${author}"][data-permlink="${permlink}"]`).closest('.post');
        const hasVoted = await checkIfVoted(author, permlink);
        
        await steem.broadcast.voteAsync(
            key,
            steemUsername,
            author,
            permlink,
            hasVoted ? 0 : 10000 // Toggle between 0 (unvote) and 100% upvote
        );

        // Update only this specific post's UI
        await updatePostUI(postElement, author, permlink);
    } catch (error) {
        console.error('Failed to vote:', error);
        alert('Failed to vote: ' + error.message);
    }
}

async function loadSuggestions() {
    try {
        // Get trending authors in the photography tag
        const trending = await steem.api.getDiscussionsByTrendingAsync({ tag: 'photography', limit: 5 });
        const authors = trending.map(post => post.author)
            .filter((author, index, self) => self.indexOf(author) === index)
            .filter(author => author !== steemUsername)
            .slice(0, 5);
        
        const authorAccounts = await steem.api.getAccountsAsync(authors);
        const suggestionsContainer = document.getElementById('suggestions-container');

        suggestionsContainer.innerHTML = '<h4>Suggestions For You</h4>' + 
            authorAccounts.map(account => `
                <div class="suggestion">
                    <div class="avatar">
                        <img src="${getSteemProfileImage(account)}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">
                    </div>
                    <div>
                        <div>${account.name}</div>
                        <small>Active in photography</small>
                    </div>
                </div>
            `).join('');
    } catch (error) {
        console.error('Failed to load suggestions:', error);
    }
}

async function viewStory(username) {
    try {
        const posts = await steem.api.getDiscussionsByAuthorBeforeDateAsync(
            username, '', new Date().toISOString().split('T')[0], 1
        );
        if (posts.length > 0) {
            alert(`Latest post by ${username}: ${posts[0].title}`);
        }
    } catch (error) {
        console.error('Failed to load user story:', error);
        alert('Failed to load story');
    }
}

// Update attemptSteemLogin to call loadSteemPosts
async function attemptSteemLogin() {
    if (typeof steem === 'undefined') {
        alert('Steem library not loaded');
        return;
    }
    const username = document.getElementById('steemUsername').value;
    const key = document.getElementById('steemKey').value;

    if (!username) {
        alert('Please enter a username');
        return;
    }

    try {
        steem.api.setOptions({ url: 'https://api.steemit.com' });
        
        // Verify account exists
        const accounts = await steem.api.getAccountsAsync([username]);
        
        if (accounts && accounts.length > 0) {
            steemUsername = username;
            steemConnection = true;
            
            // Update profile image in nav
            const profileImg = getSteemProfileImage(accounts[0]);
            updateNavProfileImage(profileImg);
            
            // Store key securely if provided
            if (key) {
                // In a real app, handle this more securely
                sessionStorage.setItem('steemPostingKey', key);
            }
            
            document.getElementById('loginModal').style.display = 'none';
            document.getElementById('steem-status').className = 'steem-status connected';
            document.getElementById('steem-status').innerHTML = `
                <i class="fas fa-check-circle"></i> Connected to Steem as: <strong>${username}</strong>
                <br>
                <small>Using Steem.js v${steem.version} | <a href="https://developers.steem.io/resources/client_libs" target="_blank">API Documentation</a></small>
            `;
            
            // Only now load Steem content
            await initializeSteemContent();
        } else {
            throw new Error('Account not found');
        }
    } catch (error) {
        console.error('Steem connection error:', error);
        alert('Failed to connect to Steem. Please verify your username and try again.'+error);
    }
}

async function connectToSteem() {
    document.getElementById('loginModal').style.display = 'flex';
}

// Modify window.addEventListener to remove immediate API calls
document.addEventListener('DOMContentLoaded', () => {
    router = new Router(routes);
    
    // Update navigation event listeners
    document.querySelectorAll('.nav-icons i').forEach(icon => {
        icon.addEventListener('click', (e) => {
            e.preventDefault();
            if (!steemConnection && icon.dataset.route !== '/') {
                alert('Please connect to Steem first');
                return;
            }
            router.navigate(icon.dataset.route);
        });
    });

    const loginModal = document.getElementById('loginModal');
    const loginButton = document.getElementById('loginButton');
    const connectSteemButton = document.getElementById('connect-steem');
    
    if (loginModal) {
        loginModal.style.display = 'flex';
    }
    
    if (loginButton) {
        loginButton.addEventListener('click', attemptSteemLogin);
    }
    
    if (connectSteemButton) {
        connectSteemButton.addEventListener('click', connectToSteem);
    }

    // Only set up basic UI event listeners, no Steem calls
    setupUIEventListeners();
});

// New function to initialize Steem content after successful login
async function initializeSteemContent() {
    try {
        await loadUserProfile();
        await loadSuggestions();
        // Let the router handle the initial view loading
        router.handleRoute();
    } catch (error) {
        console.error('Failed to initialize Steem content:', error);
    }
}

// New function for basic UI event listeners
function setupUIEventListeners() {
    document.querySelectorAll('.story').forEach(story => {
        story.addEventListener('click', function() {
            if (!steemConnection) {
                alert('Please connect to Steem first');
                return;
            }
            this.style.opacity = '0.5';
            setTimeout(() => this.style.opacity = '1', 2000);
        });
    });

    const searchBar = document.querySelector('.search-bar');
    if (searchBar) {
        searchBar.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            console.log('Searching for:', searchTerm);
        });
    }

    // Aggiorna l'handler per l'icona del cuore
    const navHeartIcon = document.querySelector('.nav-icons .far.fa-heart');
    if (navHeartIcon) {
        navHeartIcon.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!steemConnection || !steemUsername) {
                alert('Please connect to Steem first');
                return;
            }
            showLikedPosts();
        });
    }
}

// Move initialization function definition to be with other functions
function initializeSteemConnection() {
    const key = sessionStorage.getItem('steemPostingKey');
    const steemKeyInput = document.getElementById('steemKey');
    if (key && steemKeyInput) {
        steemKeyInput.value = key;
    }
}

// Aggiungi questa nuova funzione
async function loadUserProfile() {
    if (!steemUsername) return;
    
    try {
        const [account] = await steem.api.getAccountsAsync([steemUsername]);
        const profileImg = getSteemProfileImage(account);
        
        const profileContainer = document.getElementById('user-profile');
        if (profileContainer) {
            profileContainer.innerHTML = `
                <div class="profile-header">
                    <div class="avatar">
                        <img src="${profileImg}" 
                             style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">
                    </div>
                    <div class="profile-info">
                        <strong>${account.name}</strong>
                        <span class="reputation">${steem.formatter.reputation(account.reputation)}</span>
                        <small>${account.post_count} posts</small>
                    </div>
                </div>
            `;
            profileContainer.style.display = 'block';
        }
    } catch (error) {
        console.error('Failed to load user profile:', error);
    }
}

async function updatePostUI(postElement, author, permlink) {
    try {
        const hasVoted = await checkIfVoted(author, permlink);
        const heartIcon = postElement.querySelector('.like-animation');
        const votesCount = postElement.querySelector('.votes-count');
        
        // Update heart icon
        heartIcon.className = hasVoted ? 'fas fa-heart text-danger like-animation' : 'far fa-heart like-animation';
        
        // Update votes count
        const post = await steem.api.getContentAsync(author, permlink);
        votesCount.textContent = `${post.net_votes} votes`;
        
        // Update voters list
        showVoters(author, permlink, votesCount);
    } catch (error) {
        console.error('Failed to update post UI:', error);
    }
}

// Replace the existing votePost function
async function votePost(author, permlink) {
    if (!steemConnection || !steemUsername) {
        alert('Please connect to Steem first');
        return;
    }

    try {
        const key = sessionStorage.getItem('steemPostingKey');
        if (!key) {
            throw new Error('Posting key required');
        }

        const postElement = document.querySelector(`[data-author="${author}"][data-permlink="${permlink}"]`).closest('.post');
        const hasVoted = await checkIfVoted(author, permlink);
        
        await steem.broadcast.voteAsync(
            key,
            steemUsername,
            author,
            permlink,
            hasVoted ? 0 : 10000 // Toggle between 0 (unvote) and 100% upvote
        );

        // Update only this specific post's UI
        await updatePostUI(postElement, author, permlink);
    } catch (error) {
        console.error('Failed to vote:', error);
        alert('Failed to vote: ' + error.message);
    }
}

// Update the renderPosts function to add data attributes to the post
async function renderPosts(steemPosts) {
    const container = document.getElementById('posts-container');
    container.innerHTML = '';

    for (const post of steemPosts) {
        const postElement = document.createElement('div');
        postElement.className = 'post';
        
        const imgRegex = /<img[^>]+src="([^">]+)"/;
        const imgMatch = post.body.match(imgRegex);
        const imageUrl = imgMatch ? imgMatch[1] : 'https://via.placeholder.com/500';
        const avatarUrl = avatarCache.get(post.author);
        
        // Check if the current user has voted on this post
        const hasVoted = await checkIfVoted(post.author, post.permlink);
        const heartClass = hasVoted ? 'fas fa-heart text-danger' : 'far fa-heart';

        postElement.innerHTML = `
            <div class="post-header">
                <div class="avatar">
                    <img src="${avatarUrl}" 
                         style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">
                </div>
                <div>${post.author}</div>
            </div>
            <div class="post-image">
                <img src="${imageUrl}" style="max-width: 100%; max-height: 500px; object-fit: cover;">
            </div>
            <div class="post-actions">
                <i class="${heartClass} like-animation" 
                   onclick="votePost('${post.author}', '${post.permlink}')"
                   data-author="${post.author}"
                   data-permlink="${post.permlink}"></i>
                <i class="far fa-comment"></i>
                <span class="votes-count" style="cursor: pointer;">${post.net_votes} votes</span>
                <span>${post.pending_payout_value}</span>
            </div>
            <div class="post-description">
                <p><strong>${post.author}</strong> ${post.title}</p>
                <small>${new Date(post.created).toLocaleDateString()}</small>
            </div>
        `;

        container.appendChild(postElement);
        
        // Add voters list to the votes count element
        const votesCountElement = postElement.querySelector('.votes-count');
        showVoters(post.author, post.permlink, votesCountElement);
    }
}

async function showMyPosts() {
    if (!steemConnection || !steemUsername) {
        alert('Please connect to Steem first');
        return;
    }

    try {
        const modal = document.getElementById('myPostsModal');
        const container = document.getElementById('my-posts-list');
        container.innerHTML = '<p>Loading your posts...</p>';
        modal.style.display = 'flex';

        const posts = await steem.api.getDiscussionsByAuthorBeforeDateAsync(
            steemUsername,
            '',
            new Date().toISOString().split('T')[0],
            20
        );

        if (posts.length === 0) {
            container.innerHTML = '<p>No posts found</p>';
            return;
        }

        container.innerHTML = posts.map(post => `
            <div class="post" style="margin-bottom: 1rem;">
                <div class="post-header">
                    <strong>${post.title}</strong>
                </div>
                <div class="post-description">
                    <p>${post.net_votes} votes • ${post.pending_payout_value}</p>
                    <small>${new Date(post.created).toLocaleDateString()}</small>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Failed to load your posts:', error);
        alert('Failed to load posts: ' + error.message);
    }
}

function closeMyPosts() {
    const modal = document.getElementById('myPostsModal');
    modal.style.display = 'none';
}

// Add new functions for likes handling
async function showLikedPosts() {
    try {
        const modal = document.getElementById('likesModal');
        const container = document.getElementById('liked-posts-list');
        if (!modal || !container) {
            console.error('Required DOM elements not found');
            return;
        }

        container.innerHTML = '<p>Loading liked posts...</p>';
        modal.style.display = 'flex';

        // Get user's voting history
        const votes = await steem.api.getAccountVotesAsync(steemUsername);
        
        if (!votes || votes.length === 0) {
            container.innerHTML = '<p>No liked posts found</p>';
            return;
        }

        // Get details for each voted post
        const likedPosts = [];
        for (const vote of votes.slice(-20)) {
            try {
                const post = await steem.api.getContentAsync(vote.author, vote.permlink);
                if (post && post.parent_author === '') {
                    likedPosts.push(post);
                }
            } catch (error) {
                console.warn('Error fetching post:', error);
            }
        }

        if (likedPosts.length === 0) {
            container.innerHTML = '<p>No viewable liked posts found</p>';
            return;
        }

        container.innerHTML = likedPosts.map(post => {
            const imgRegex = /<img[^>]+src="([^">]+)"/;
            const imgMatch = post.body.match(imgRegex);
            const imageUrl = imgMatch ? imgMatch[1] : 'https://via.placeholder.com/50';
            
            return `
                <div class="liked-post">
                    <img src="${imageUrl}" alt="Post thumbnail">
                    <div class="liked-post-info">
                        <strong>${post.author}</strong>
                        <p>${post.title}</p>
                        <small>${new Date(post.created).toLocaleDateString()}</small>
                    </div>
                    <div class="post-stats">
                        <small>${post.net_votes} votes</small>
                        <small>$${parseFloat(post.pending_payout_value).toFixed(2)}</small>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Failed to load liked posts:', error);
        const container = document.getElementById('liked-posts-list');
        if (container) {
            container.innerHTML = '<p>Error loading liked posts. Please try again.</p>';
        }
    }
}

function closeLikesModal() {
    const modal = document.getElementById('likesModal');
    modal.style.display = 'none';
}

// Aggiungi una funzione per il debug
function debugLikedPosts() {
    console.log('Current connection status:', steemConnection);
    console.log('Current username:', steemUsername);
    const modal = document.getElementById('likesModal');
    console.log('Modal element:', modal);
    const container = document.getElementById('liked-posts-list');
    console.log('Container element:', container);
}

// Add this new function
async function loadExploreContent() {
    try {
        const query = {
            tag: 'photography',
            limit: 20
        };
        const posts = await steem.api.getDiscussionsByTrendingAsync(query);
        renderPosts(posts);
    } catch (error) {
        console.error('Failed to load explore content:', error);
    }
}