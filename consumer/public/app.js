const videoGrid = document.getElementById("video-grid");
const modal = document.getElementById("video-modal");
const mainVideo = document.getElementById("main-video");
const modalTitle = document.getElementById("modal-title");
const closeModalButton = document.getElementById("close-modal");

async function loadVideos() {
    try {
        const response = await fetch("/api/videos");
        if (!response.ok) {
            throw new Error(`Failed to fetch videos: ${response.statusText}`);
        }
        const videos = await response.json();
        renderVideos(videos);
    } catch (error) {
        console.error("Error loading videos:", error);
        videoGrid.innerHTML = "<p>Failed to load videos. Please try again later.</p>";
    }
}

function renderVideos(videos) {
    videoGrid.innerHTML = "";
    if( videos.length === 0) {
        videoGrid.innerHTML = "<p>No videos available.</p>";
        return;
    }
    for (const video of videos) {
        const card = document.createElement("div");
        card.className = "video-card";

        const preview = document.createElement("video");

        preview.className = "video-preview";
        preview.src = video.previewUrl;

        preview.muted = true;
        preview.preload = "metadata";
        preview.playsInline = true;

        card.addEventListener("mouseenter", () => {
            preview.currentTime = 0;
            preview.play().catch(() => {});
        });

        card.addEventListener("mouseleave", () => {
            preview.pause();
            preview.currentTime = 0;
        });

        const title = document.createElement("p");
        title.className = "video-title";
        title.textContent = video.filename;

        card.addEventListener("click", () => {
            openVideo(video);
        });

        card.appendChild(preview);
        card.appendChild(title);
        videoGrid.appendChild(card);
    }
}

function openVideo(video) {
    modalTitle.textContent = video.filename;

    mainVideo.src = video.videoUrl;
    mainVideo.playsInline = true;

    modal.classList.remove("hidden");

    mainVideo.play().catch(() => {});
}

function closeVideo() {
    mainVideo.pause();
    mainVideo.src = "";
    modal.classList.add("hidden");
}

closeModalButton.addEventListener("click", closeVideo);

modal.addEventListener("click", event => {
    if(event.target === modal) closeVideo();
});

setInterval(loadVideos, 5000);