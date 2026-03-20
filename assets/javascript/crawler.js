function onWindowLoad() {
    const checkElements = () => {
        const pc = document.getElementById('pagination-container');
        const uc = document.getElementById('urls-list');
        
        if (pc && uc) {
            init(pc, uc);
        } else {
            console.log('Waiting for elements...', document.body.innerHTML.substring(0, 200));
            requestAnimationFrame(checkElements);
        }
    };
    
    requestAnimationFrame(checkElements);
}

function init(paginationContainer, urlsContainer) {
    console.log('LinkHawk: Initialized with elements', { paginationContainer, urlsContainer });
    
    const message = document.querySelector('#message');
    const loadingSpinner = document.getElementById('loading-spinner');
    const controlsSection = document.getElementById('controls-section');
    const errorContainer = document.getElementById('error-container');
    const resultsInfoEl = document.getElementById('results-text');
    const statusBar = document.getElementById('status-bar');
    const searchInput = document.getElementById('search-input');
    const perPageSelect = document.getElementById('per-page-select');

    let currentPage = 1;
    let itemsPerPage = 10;
    let allUrls = [];
    let filteredUrls = [];

    if (loadingSpinner) loadingSpinner.classList.add('active');
    if (statusBar) statusBar.innerHTML = '<span class="status-dot"></span><span>Crawling...</span>';

    chrome.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
        const activeTab = tabs[0];
        const activeTabId = activeTab.id;
        const currentUrl = activeTab.url;

        if (!currentUrl || currentUrl.startsWith('chrome://') || currentUrl.startsWith('about:')) {
            throw new Error('Cannot access this page');
        }

        return chrome.scripting.executeScript({
            target: { tabId: activeTabId },
            func: websiteCrawler,
            args: [currentUrl]
        });
    }).then(function (results) {
        console.log('LinkHawk: Results received:', results);
        if (loadingSpinner) loadingSpinner.classList.remove('active');
        allUrls = results[0].result || [];
        filteredUrls = [...allUrls];
        
        console.log('LinkHawk: URLs found:', allUrls.length);

        if (allUrls.length === 0) {
            if (errorContainer) errorContainer.innerHTML = '<div class="empty-message">No URLs found on this page</div>';
            if (statusBar) statusBar.innerHTML = '<span>No URLs found</span>';
            return;
        }

        if (controlsSection) controlsSection.style.display = 'block';
        updateStats();
        createPagination();
        showPage(currentPage);
        if (statusBar) statusBar.innerHTML = `<span class="status-dot"></span><span>Found ${allUrls.length} URLs</span>`;

    }).catch(function (error) {
        if (loadingSpinner) loadingSpinner.classList.remove('active');
        if (errorContainer) errorContainer.innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
        if (statusBar) statusBar.innerHTML = '<span>Error occurred</span>';
        console.error('LinkHawk error:', error);
    });

    function updateStats() {
        const total = filteredUrls.length;
        const pages = Math.ceil(total / itemsPerPage);
        if (resultsInfoEl) resultsInfoEl.textContent = `${total} URLs · ${pages} pages`;
    }

    function showPage(pageNumber) {
        console.log('LinkHawk: showPage', { pageNumber, count: filteredUrls.length });
        
        if (!urlsContainer) {
            console.error('LinkHawk: urlsContainer missing');
            return;
        }
        
        const startIndex = (pageNumber - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, filteredUrls.length);

        let html = '';

        if (filteredUrls.length === 0) {
            html = '<li class="list-group-item">No URLs found</li>';
        } else {
            for (let i = startIndex; i < endIndex; i++) {
                const url = filteredUrls[i];
                const displayUrl = url.length > 45 ? url.slice(0, 45) + '...' : url;
                html += `<li class="list-group-item"><a href="${url}" target="_blank">${displayUrl}</a></li>`;
            }
        }

        urlsContainer.innerHTML = html;
        
        // Update results text at bottom
        const infoEl = document.getElementById('results-info');
        if (infoEl) {
            const selectEl = document.getElementById('per-page-select');
            const textEl = document.getElementById('results-text');
            const pages = Math.ceil(filteredUrls.length / itemsPerPage);
            textEl.textContent = `${filteredUrls.length} URLs · ${pages} pages`;
        }
    }

    function updatePaginationButtons(activePage) {
        const paginationList = document.querySelector('.pagination');
        if (!paginationList) return;
        
        const pageItems = paginationList.querySelectorAll('.page-item');
        pageItems.forEach((item, index) => {
            const pageNum = index + 1;
            if (pageNum === activePage) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    function createPagination() {
        if (!paginationContainer) {
            console.error('LinkHawk: Pagination container not found');
            return;
        }
        
        const oldPagination = paginationContainer.querySelector('.pagination');
        if (oldPagination) oldPagination.remove();

        const total = filteredUrls.length;
        const totalPages = Math.ceil(total / itemsPerPage);
        
        if (totalPages <= 1) return;

        const paginationList = document.createElement("ul");
        paginationList.classList.add("pagination");
        paginationList.classList.add("flex-wrap");

        const maxVisiblePages = 7;
        let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
        
        if (endPage - startPage < maxVisiblePages - 1) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        if (startPage > 1) {
            const firstItem = createPageItem(1);
            paginationList.appendChild(firstItem);
            if (startPage > 2) {
                const ellipsis = document.createElement("li");
                ellipsis.className = "page-item";
                ellipsis.innerHTML = '<span class="page-link" style="border:none;">...</span>';
                paginationList.appendChild(ellipsis);
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            paginationList.appendChild(createPageItem(i));
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                const ellipsis = document.createElement("li");
                ellipsis.className = "page-item";
                ellipsis.innerHTML = '<span class="page-link" style="border:none;">...</span>';
                paginationList.appendChild(ellipsis);
            }
            const lastItem = createPageItem(totalPages);
            paginationList.appendChild(lastItem);
        }

        paginationContainer.appendChild(paginationList);

        paginationList.addEventListener("click", function (event) {
            event.preventDefault();
            if (event.target.classList.contains("page-link") && event.target.tagName === 'A') {
                const pageNumber = parseInt(event.target.textContent);
                if (!isNaN(pageNumber)) {
                    currentPage = pageNumber;
                    showPage(currentPage);
                }
            }
        });
    }

    function createPageItem(pageNum) {
        const listItem = document.createElement("li");
        listItem.classList.add("page-item");
        
        const link = document.createElement("a");
        link.classList.add("page-link");
        link.href = "#";
        link.textContent = pageNum;
        
        listItem.appendChild(link);
        return listItem;
    }

    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            const query = e.target.value.toLowerCase().trim();
            
            if (!query) {
                filteredUrls = [...allUrls];
            } else {
                filteredUrls = allUrls.filter(url => url.toLowerCase().includes(query));
            }
            
            currentPage = 1;
            updateStats();
            createPagination();
            showPage(currentPage);
            
            if (filteredUrls.length === 0 && resultsInfoEl) {
                resultsInfoEl.textContent = 'No matching URLs found';
            }
        });
    }

    if (perPageSelect) {
        perPageSelect.addEventListener('change', function(e) {
            itemsPerPage = parseInt(e.target.value);
            currentPage = 1;
            updateStats();
            createPagination();
            showPage(currentPage);
        });
    }

    // Export functionality
    const exportBtn = document.getElementById('export-btn');
    const exportMenu = document.getElementById('export-menu');
    
    if (exportBtn && exportMenu) {
        exportBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            exportMenu.classList.toggle('show');
        });
        
        document.addEventListener('click', function() {
            exportMenu.classList.remove('show');
        });
        
        document.getElementById('export-txt').addEventListener('click', function(e) {
            e.preventDefault();
            const blob = new Blob([allUrls.join('\n')], { type: 'text/plain' });
            downloadBlob(blob, 'urls.txt');
            exportMenu.classList.remove('show');
        });
        
        document.getElementById('export-json').addEventListener('click', function(e) {
            e.preventDefault();
            const blob = new Blob([JSON.stringify(allUrls, null, 2)], { type: 'application/json' });
            downloadBlob(blob, 'urls.json');
            exportMenu.classList.remove('show');
        });
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

window.onload = onWindowLoad;

function websiteCrawler(currentUrl) {
    const anchorTags = document.getElementsByTagName("a");
    const urls = [];
    const originUrl = new URL(currentUrl);

    for (let i = 0; i < anchorTags.length; i++) {
        const url = anchorTags[i].getAttribute("href");
        
        if (!url || url.startsWith('javascript:') || url.startsWith('#') || url === '/') {
            continue;
        }

        if (url.startsWith('/')) {
            const combined = `${originUrl.origin}${url}`;
            urls.push(combined);
            continue;
        }

        if (!/^https?:\/\//i.test(url)) {
            const combined = `${originUrl.origin}/${url.replace(/^\/+/, '')}`;
            urls.push(combined);
            continue;
        }

        urls.push(url);
    }

    return [...new Set(urls)];
}