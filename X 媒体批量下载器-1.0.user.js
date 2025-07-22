// ==UserScript==
// @name         X 媒体批量下载器
// @namespace    https://github.com/Camellia895
// @version      1.0
// @description  在推文中添加“下载”按钮，下载PNG原图。在用户的'媒体'页面，增加“批量下载”按钮，可滚动收集页面所有图片后一键下载。修复了批量下载时的性能问题。
// @author       Gemini & Camellia895
// @match        *://*.twitter.com/*
// @match        *://*.x.com/*
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @license      MIT
// @run-at       document-end
// @downloadURL https://update.greasyfork.org/scripts/543334/X%20%E5%AA%92%E4%BD%93%E6%89%B9%E9%87%8F%E4%B8%8B%E8%BD%BD%E5%99%A8.user.js
// @updateURL https://update.greasyfork.org/scripts/543334/X%20%E5%AA%92%E4%BD%93%E6%89%B9%E9%87%8F%E4%B8%8B%E8%BD%BD%E5%99%A8.meta.js
// ==/UserScript==

(function() {
    'use strict';

    // --- 全局状态和设置 ---
    const STYLE = { DATE_ONLY: 1, DATE_HMS: 2 };
    let namingStyle = GM_getValue('namingStyle', STYLE.DATE_ONLY);
    let menuIDs = [];

    // 批量下载器的状态
    let isCollecting = false;
    let downloadQueue = new Set();
    let mediaPageObserver = null;
    let batchDownloadBtn = null;
    let currentUsername = '';
    let lastReportedCount = 0; // 【修复】用于条件性更新

    // --- 菜单和命名规则 ---
    function registerMenu() {
        menuIDs.forEach(id => { try { GM_unregisterMenuCommand(id); } catch (e) {} });
        menuIDs = [];
        const label1 = (namingStyle === STYLE.DATE_ONLY ? '✅ ' : '❌ ') + '命名：年月日 (单推文)';
        menuIDs.push(GM_registerMenuCommand(label1, () => {
            namingStyle = STYLE.DATE_ONLY;
            GM_setValue('namingStyle', namingStyle);
            registerMenu();
        }));
        const label2 = (namingStyle === STYLE.DATE_HMS ? '✅ ' : '❌ ') + '命名：年月日-时分秒 (单推文)';
        menuIDs.push(GM_registerMenuCommand(label2, () => {
            namingStyle = STYLE.DATE_HMS;
            GM_setValue('namingStyle', namingStyle);
            registerMenu();
        }));
    }
    registerMenu();

    function formatDate(d) {
        const Y = d.getFullYear(), M = String(d.getMonth() + 1).padStart(2, '0'), D = String(d.getDate()).padStart(2, '0');
        let s = `${Y}${M}${D}`;
        if (namingStyle === STYLE.DATE_HMS) {
            const h = String(d.getHours()).padStart(2, '0'), m = String(d.getMinutes()).padStart(2, '0'), sec = String(d.getSeconds()).padStart(2, '0');
            s += `-${h}${m}${sec}`;
        }
        return s;
    }

    // 【修复】节流工具函数
    function throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    // --- 核心下载函数 ---
    async function download(url, filename) {
        try {
            const res = await fetch(url);
            if (!res.ok) { console.error(`下载失败: ${res.status}`, url); return; }
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl; a.download = filename;
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(blobUrl);
        } catch (error) { console.error('下载时发生网络错误:', error); }
    }

    // --- 功能1: 单条推文下载 ---
    function addSingleTweetButton(tweet) {
        if (tweet.querySelector('.download-images-btn')) return;
        const grp = tweet.querySelector('div[role="group"]');
        if (!grp) return;
        const btn = document.createElement('button');
        btn.innerText = '下载图片';
        btn.className = 'download-images-btn';
        btn.style.cssText = 'margin-left:8px;cursor:pointer;background:#1da1f2;color:#fff;border:none;padding:4px 8px;border-radius:4px;font-size:12px;';
        btn.addEventListener('click', async (e) => {
            e.preventDefault(); e.stopPropagation();
            let name = 'unknown';
            const userElement = tweet.querySelector('[data-testid="User-Name"]');
            if (userElement) {
                const nameDiv = userElement.querySelector('div[dir="ltr"]');
                if (nameDiv && nameDiv.textContent.trim()) name = nameDiv.textContent.trim();
            }
            name = name.replace(/[\\/:*?"<>|]/g, '_');
            const timeEl = tweet.querySelector('time');
            const dt = timeEl ? new Date(timeEl.dateTime) : new Date();
            const ds = formatDate(dt);
            const imgs = tweet.querySelectorAll('img[src*="pbs.twimg.com/media"]');
            const urls = Array.from(imgs, img => img.src.split('?')[0] + '?name=orig&format=png');
            if (!urls.length) return;
            const single = urls.length === 1;
            for (let i = 0; i < urls.length; i++) {
                const fn = single ? `${name}-${ds}.png` : `${name}-${ds}-${String(i + 1).padStart(2, '0')}.png`;
                await download(urls[i], fn);
                if (!single) await new Promise(resolve => setTimeout(resolve, 500));
            }
        });
        grp.appendChild(btn);
    }

    // --- 功能2: 媒体页批量下载 ---
    function getUsernameFromURL() {
        const match = window.location.pathname.match(/^\/([a-zA-Z0-9_]+)/);
        return match ? match[1] : 'unknown_user';
    }

    // 【修复】扫描函数现在只负责收集数据，不直接更新UI
    function scanForMediaImages() {
        const images = document.querySelectorAll('a[href*="/photo/"] img[src*="pbs.twimg.com/media"]');
        let initialSize = downloadQueue.size;
        images.forEach(img => downloadQueue.add(img.src));

        // 【修复】只有当数量实际增加时，才去更新按钮文本
        if (downloadQueue.size > lastReportedCount) {
            console.log(`发现 ${downloadQueue.size - lastReportedCount} 张新图片, 总计 ${downloadQueue.size} 张.`);
            lastReportedCount = downloadQueue.size;
            if (batchDownloadBtn && isCollecting) {
                batchDownloadBtn.textContent = `收集中... (${lastReportedCount} 张). 再点一次开始下载`;
            }
        }
    }
    // 【修复】创建一个节流版的扫描函数，每500毫秒最多执行一次
    const throttledScan = throttle(scanForMediaImages, 500);

    function startCollecting() {
        console.log("开始收集图片...");
        isCollecting = true;
        downloadQueue.clear();
        lastReportedCount = 0;
        currentUsername = getUsernameFromURL();

        if (batchDownloadBtn) {
            batchDownloadBtn.textContent = '收集中... (0 张). 再点一次开始下载';
            batchDownloadBtn.style.backgroundColor = '#ff69b4';
        }

        throttledScan(); // 立即执行一次

        // 【修复】观察目标更精确，不再是整个body，而是主要内容区域
        const targetNode = document.querySelector('main[role="main"]');
        if (!targetNode) {
            console.error("找不到主要内容区域 (main[role='main']) 来进行观察。");
            return;
        }
        mediaPageObserver = new MutationObserver(throttledScan);
        mediaPageObserver.observe(targetNode, { childList: true, subtree: true });
    }

    async function stopCollectingAndDownload() {
        console.log("收集完成, 准备下载...");
        isCollecting = false;
        if (mediaPageObserver) {
            mediaPageObserver.disconnect();
            mediaPageObserver = null;
        }

        if (downloadQueue.size === 0) {
            alert("没有收集到任何图片链接！");
            if (batchDownloadBtn) {
                 batchDownloadBtn.textContent = '批量下载媒体';
                 batchDownloadBtn.style.backgroundColor = '#1da1f2';
            }
            return;
        }

        const urlsToDownload = Array.from(downloadQueue);
        for (let i = 0; i < urlsToDownload.length; i++) {
            const url = urlsToDownload[i];
            const baseUrl = url.split('?')[0];
            const imageId = baseUrl.split('/').pop();
            const originalUrl = `${baseUrl}?format=png&name=orig`;
            const filename = `${currentUsername}-${imageId}.png`;

            if (batchDownloadBtn) {
                batchDownloadBtn.textContent = `下载中: ${i + 1} / ${urlsToDownload.length}`;
                batchDownloadBtn.style.backgroundColor = '#f44336';
            }

            await download(originalUrl, filename);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        alert(`下载完成！共下载了 ${urlsToDownload.length} 张图片。`);

        if (batchDownloadBtn) {
            batchDownloadBtn.textContent = '批量下载媒体';
            batchDownloadBtn.style.backgroundColor = '#1da1f2';
        }
        downloadQueue.clear();
        lastReportedCount = 0;
    }

    function addBatchDownloaderButton() {
        const userNameElement = document.querySelector('[data-testid="UserName"]');
        if (!userNameElement) return;
        const buttonContainer = userNameElement.parentElement;
        if (!buttonContainer || document.getElementById('batch-media-downloader-btn')) return;

        batchDownloadBtn = document.createElement('button');
        batchDownloadBtn.id = 'batch-media-downloader-btn';
        batchDownloadBtn.textContent = '批量下载媒体';
        batchDownloadBtn.style.cssText = 'margin-left: 12px; padding: 6px 12px; background-color: #1da1f2; color: white; border: none; border-radius: 999px; cursor: pointer; font-weight: bold; transition: background-color 0.3s;';
        batchDownloadBtn.addEventListener('click', (e) => {
             e.preventDefault(); e.stopPropagation();
            if (!isCollecting) { startCollecting(); } else { stopCollectingAndDownload(); }
        });
        buttonContainer.appendChild(batchDownloadBtn);
    }

    // --- 主函数：统一处理页面变化 ---
    function handlePageChanges() {
        // 功能1: 单推文按钮
        document.querySelectorAll('article[role="article"]:not(:has(.download-images-btn))').forEach(addSingleTweetButton);

        // 功能2: 批量下载按钮
        if (window.location.href.includes('/media')) {
            addBatchDownloaderButton();
        } else {
            if (isCollecting) {
                isCollecting = false;
                if(mediaPageObserver) mediaPageObserver.disconnect();
                downloadQueue.clear();
                lastReportedCount = 0;
                console.log("已离开媒体页, 自动停止收集。");
            }
        }
    }

    // 使用一个更高效的主观察者
    const mainObserver = new MutationObserver(throttle(handlePageChanges, 500));
    mainObserver.observe(document.body, { childList: true, subtree: true });

    // 初始加载时执行一次
    handlePageChanges();

})();