let video;
let prevImage = null;
let currentImage = null;

let scaledWidth = 60; // Default downscaled image width
let scaledHeight = 0.75 * scaledWidth; // Default downscaled image height
const diameterAdj = 0.9;
const backgroundColor = 0;
const backgroundFader = 8;

const captureInterval = 8 * 1000; // 8 seconds total
let lastCaptureTime = 0;

let transitionPixels = [];
let transitionStartTime = 0;
const duration = captureInterval;

const tolerance = 30;
const initialDelay = 200; // 200ms delay for the second frame

// Jitter settings
const durationJitter = 500; // Each pixel can start up to 500ms late
const safeEndMargin = 500; // All pixels must finish at least 500ms before 'duration'
const minPixelDuration = captureInterval - 1000; // Each pixel moves at least (captureInterval-1000)ms

let firstTwoFramesCaptured = false;
let timeOfFirstFrame = 0;

function setup() {
  createCanvasForCurrentResolution();
  video = createCapture(VIDEO, () => {
    capturePhotoAsPrevImage();
  });
  video.size(scaledWidth, scaledHeight);
  video.hide();
  noStroke();
}

function draw() {
  background(backgroundColor, backgroundFader);

  push();
  translate(width, 0);
  scale(-1, 1);

  let elapsedTime = millis() - transitionStartTime;

  // After first frame, wait initialDelay ms before second frame
  if (
    !firstTwoFramesCaptured &&
    prevImage &&
    timeOfFirstFrame > 0 &&
    transitionPixels.length === 0
  ) {
    if (millis() - timeOfFirstFrame > initialDelay) {
      captureNewImageAndPrepareTransition();
    }
  }

  if (transitionPixels.length === 0) {
    // No ongoing transition
    if (firstTwoFramesCaptured) {
      if (millis() - lastCaptureTime > captureInterval) {
        captureNewImageAndPrepareTransition();
      }
    }

    pop();
    return;
  }

  // If we are mid-transition
  if (transitionPixels.length > 0) {
    drawImage(prevImage, scaledWidth, scaledHeight);

    const pixelWidth = width / scaledWidth;
    const pixelHeight = height / scaledHeight;

    let allDone = true;
    for (let p of transitionPixels) {
      let pixelElapsed = elapsedTime - p.startDelay;
      let pixelProgress = constrain(pixelElapsed / p.pixelDuration, 0, 1);
      let easedProgress = easeInOutCubic(pixelProgress);

      if (pixelProgress < 1) allDone = false; // Not done yet

      let x =
        lerp(p.startX, p.targetX, easedProgress) * pixelWidth + pixelWidth / 2;
      let y =
        lerp(p.startY, p.targetY, easedProgress) * pixelHeight +
        pixelHeight / 2;

      let r = lerp(p.startColor[0], p.targetColor[0], easedProgress);
      let g = lerp(p.startColor[1], p.targetColor[1], easedProgress);
      let b = lerp(p.startColor[2], p.targetColor[2], easedProgress);

      let diameter = min(pixelWidth, pixelHeight);
      fill(r, g, b);
      circle(x, y, diameter * diameterAdj);
    }

    if (allDone) {
      // All pixels finished early, well before duration
      transitionPixels = [];
      prevImage = currentImage.slice();

      if (!firstTwoFramesCaptured) {
        firstTwoFramesCaptured = true;
        lastCaptureTime = millis() - initialDelay;
      }

      if (firstTwoFramesCaptured) {
        captureNewImageAndPrepareTransition();
      }
    }
  }

  pop();
}

function capturePhotoAsPrevImage() {
  video.loadPixels();
  if (video.pixels.length > 0) {
    prevImage = Array.from(video.pixels);
    lastCaptureTime = millis();
    timeOfFirstFrame = millis();
  }
}

function captureNewImageAndPrepareTransition() {
  video.loadPixels();
  if (video.pixels.length > 0) {
    currentImage = Array.from(video.pixels);
    prepareTransition();
    lastCaptureTime = millis();
  }
}

function prepareTransition() {
  transitionPixels = [];
  if (!prevImage || !currentImage) return;

  const maxEndTime = duration - safeEndMargin;

  for (let y = 0; y < scaledHeight; y++) {
    for (let x = 0; x < scaledWidth; x++) {
      let currentIndex = (y * scaledWidth + x) * 4;
      let currentColor = [
        currentImage[currentIndex],
        currentImage[currentIndex + 1],
        currentImage[currentIndex + 2],
      ];

      let startColorAtSamePos = [
        prevImage[currentIndex],
        prevImage[currentIndex + 1],
        prevImage[currentIndex + 2],
      ];

      let startX, startY, startColor;

      if (colorDistance(currentColor, startColorAtSamePos) < tolerance) {
        startX = x;
        startY = y;
        startColor = startColorAtSamePos;
      } else {
        let bestMatchIndex = findBestMatchInPrevImage(currentColor);
        if (bestMatchIndex === -1) {
          let randIndex = floor(random(0, prevImage.length / 4)) * 4;
          startX = (randIndex / 4) % scaledWidth;
          startY = floor(randIndex / 4 / scaledWidth);
          startColor = [
            prevImage[randIndex],
            prevImage[randIndex + 1],
            prevImage[randIndex + 2],
          ];
        } else {
          startX = (bestMatchIndex / 4) % scaledWidth;
          startY = floor(bestMatchIndex / 4 / scaledWidth);
          startColor = [
            prevImage[bestMatchIndex],
            prevImage[bestMatchIndex + 1],
            prevImage[bestMatchIndex + 2],
          ];
        }
      }

      let startDelay = random(durationJitter);
      let minEndTime = startDelay + minPixelDuration;
      let usableEndTimeRange = maxEndTime - minEndTime;
      if (usableEndTimeRange <= 0) {
        usableEndTimeRange = 1000;
      }
      let endTime = minEndTime + random(usableEndTimeRange);
      let pixelDuration = endTime - startDelay;

      transitionPixels.push({
        startX: startX,
        startY: startY,
        startColor: startColor,
        targetX: x,
        targetY: y,
        targetColor: currentColor,
        startDelay: startDelay,
        pixelDuration: pixelDuration,
      });
    }
  }

  transitionStartTime = millis();
}

function findBestMatchInPrevImage(color) {
  let bestIndex = -1;
  let bestDist = Infinity;

  for (let i = 0; i < prevImage.length; i += 4) {
    let candidateColor = [prevImage[i], prevImage[i + 1], prevImage[i + 2]];
    let dist = colorDistance(color, candidateColor);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function colorDistance(c1, c2) {
  let rDiff = c1[0] - c2[0];
  let gDiff = c1[1] - c2[1];
  let bDiff = c1[2] - c2[2];
  return sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff);
}

function drawImage(image, w, h) {
  const pixelWidth = width / w;
  const pixelHeight = height / h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let index = (y * w + x) * 4;
      let r = image[index];
      let g = image[index + 1];
      let b = image[index + 2];

      let drawX = x * pixelWidth + pixelWidth / 2;
      let drawY = y * pixelHeight + pixelHeight / 2;
      let diameter = min(pixelWidth, pixelHeight);

      fill(r, g, b);
      circle(drawX, drawY, diameter * diameterAdj);
    }
  }
}

function windowResized() {
  resizeCanvas(windowWidth, (windowWidth * scaledHeight) / scaledWidth);
  if (transitionPixels.length === 0 && prevImage) {
    drawImage(prevImage, scaledWidth, scaledHeight);
  }

  if (
    firstTwoFramesCaptured &&
    millis() - lastCaptureTime > captureInterval + initialDelay
  ) {
    captureNewImageAndPrepareTransition();
  }

  return;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function keyPressed() {

  if (key) {
    var dotFidelity = key;
    var minNumDots = 3;
    scaledWidth = 4 * minNumDots * dotFidelity;
    scaledHeight = 0.75 * scaledWidth;
    
    reinitializeForNewResolution();
  }
}

function reinitializeForNewResolution() {
  // Adjust the canvas size
  resizeCanvas(windowWidth, (windowWidth * scaledHeight) / scaledWidth);

  // Reinitialize video capture at the new resolution
  video.size(scaledWidth, scaledHeight);

  // Clear images so we start fresh
  prevImage = null;
  currentImage = null;
  transitionPixels = [];
  firstTwoFramesCaptured = false;
  timeOfFirstFrame = 0;
  lastCaptureTime = millis();
  transitionStartTime = 0;

  // Try capturing again
  capturePhotoAsPrevImage();
}

function createCanvasForCurrentResolution() {
  createCanvas(windowWidth, (windowWidth * scaledHeight) / scaledWidth);
}
