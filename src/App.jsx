import { useState, useRef, useEffect } from "react";
import * as fabric from "fabric";
import cv from "@techstark/opencv-js";
import { heicTo } from "heic-to";
import "./App.css";

// Custom Ribbon Brush that draws image slices along the path
class RibbonBrush extends fabric.BaseBrush {
  constructor(canvas, image, onProgress, onExhausted) {
    super(canvas);
    this.image = image;
    this.sliceWidth = 20; // Width of each slice
    this.slices = [];
    this.currentSliceIndex = 0;
    this.path = [];
    this.onProgress = onProgress; // Callback to update parent component
    this.onExhausted = onExhausted; // Callback when brush is exhausted
    this.createSlices();
  }

  createSlices() {
    if (!this.image) return;

    // Create a temporary canvas to slice the image
    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d");

    tempCanvas.width = this.image.width;
    tempCanvas.height = this.image.height;
    tempCtx.drawImage(this.image, 0, 0);

    // Create slices
    this.slices = [];
    for (let x = 0; x < this.image.width; x += this.sliceWidth) {
      const sliceCanvas = document.createElement("canvas");
      const sliceCtx = sliceCanvas.getContext("2d");

      sliceCanvas.width = this.sliceWidth;
      sliceCanvas.height = this.image.height;

      // Extract slice from original image
      const sliceWidth = Math.min(this.sliceWidth, this.image.width - x);
      const imageData = tempCtx.getImageData(x, 0, sliceWidth, this.image.height);
      sliceCtx.putImageData(imageData, 0, 0);

      this.slices.push(sliceCanvas);
    }

    // Initialize progress
    this.updateProgress();
  }

  updateProgress() {
    if (this.onProgress && this.slices.length > 0) {
      const percentage = Math.round((this.currentSliceIndex / this.slices.length) * 100);
      this.onProgress(percentage);

      // Check if brush is exhausted
      if (this.currentSliceIndex >= this.slices.length && this.onExhausted) {
        this.onExhausted(true);
      }
    }
  }

  reset() {
    this.currentSliceIndex = 0;
    this.updateProgress();

    // Reset exhausted state
    if (this.onExhausted) {
      this.onExhausted(false);
    }
  }

  onMouseDown(pointer) {
    this.path = [pointer];
    // this.currentSliceIndex = 0;
    this.canvas.requestRenderAll();
  }

  onMouseMove(pointer) {
    console.log("onMouseMove", this.path.length);
    if (this.path.length > 0) {
      this.path.push(pointer);
      this.drawSliceAtPoint(pointer);
      this.canvas.requestRenderAll();
    }
  }

  onMouseUp() {
    this.path = [];
    // this.currentSliceIndex = 0;
  }

  drawSliceAtPoint(point) {
    if (this.slices.length === 0) return;

    // Check if we're out of slices
    if (this.currentSliceIndex >= this.slices.length) {
      return; // Don't draw if exhausted
    }

    const slice = this.slices[this.currentSliceIndex];

    // Calculate angle from previous point if available
    let angle = 0;
    if (this.path.length > 1) {
      const prev = this.path[this.path.length - 2];
      const curr = point;
      angle = Math.atan2(curr.y - prev.y, curr.x - prev.x);
    }

    // Create fabric image from slice
    const fabricImage = new fabric.Image(slice, {
      left: point.x - this.sliceWidth / 2,
      top: point.y - slice.height / 2,
      angle: (angle * 180) / Math.PI,
      originX: "center",
      originY: "center",
      selectable: false,
      evented: false,
    });

    this.canvas.add(fabricImage);
    this.currentSliceIndex++;
    this.updateProgress(); // Update progress after incrementing
  }
}

function App() {
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [textContent, setTextContent] = useState("");
  const [processedImage, setProcessedImage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentPage, setCurrentPage] = useState("upload"); // "upload" or "results"
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [ribbonProgress, setRibbonProgress] = useState(0);
  const [ribbonExhausted, setRibbonExhausted] = useState(false);
  const [brushType, setBrushType] = useState("pencil"); // "pencil", "ribbon", or "text"
  const [textSentences, setTextSentences] = useState([]);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [canvasHistory, setCanvasHistory] = useState([]);
  const canvasRef = useRef(null);
  const fabricCanvasRef = useRef(null);
  const fabricCanvasInstance = useRef(null);
  const ribbonBrush = useRef(null);
  const brushTypeRef = useRef("pencil");
  const textSentencesRef = useRef([]);
  const currentSentenceIndexRef = useRef(0);

  // Process text into sentences
  const processTextIntoSentences = (text) => {
    if (!text) return [];

    // Split by periods and newlines, filter out empty strings
    const sentences = text
      .split(/[.\n]+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 0);

    return sentences;
  };

  // Update sentences when text content changes
  useEffect(() => {
    const sentences = processTextIntoSentences(textContent);
    setTextSentences(sentences);
    setCurrentSentenceIndex(0);
    textSentencesRef.current = sentences;
    currentSentenceIndexRef.current = 0;
  }, [textContent]);

  // Keep brushTypeRef in sync with brushType
  useEffect(() => {
    brushTypeRef.current = brushType;
  }, [brushType]);

  // Keep refs in sync with state
  useEffect(() => {
    textSentencesRef.current = textSentences;
  }, [textSentences]);

  useEffect(() => {
    currentSentenceIndexRef.current = currentSentenceIndex;
  }, [currentSentenceIndex]);

  // Set default brush type when entering results page
  useEffect(() => {
    if (currentPage === "results") {
      // Priority: ribbon (if image) > text (if text) > pencil (fallback)
      if (processedImage) {
        setBrushType("ribbon");
      } else if (textContent) {
        setBrushType("text");
      } else {
        setBrushType("pencil");
      }
    }
  }, [currentPage, processedImage, textContent]);

  // Initialize Fabric canvas
  useEffect(() => {
    console.log("calling init fabric canvas");
    console.log(brushType);
    if (currentPage === "results" && fabricCanvasRef.current && !fabricCanvasInstance.current) {
      // Calculate canvas size based on screen width
      const isMobile = window.innerWidth <= 768;
      const canvasSize = isMobile ? Math.min(window.innerWidth - 40, 400) : 700;

      const canvas = new fabric.Canvas(fabricCanvasRef.current, {
        width: canvasSize,
        height: canvasSize,
        backgroundColor: "#000000",
        isDrawingMode: true,
      });

      // Enable drawing mode and set up a white pencil brush
      const brush = new fabric.PencilBrush(canvas);
      brush.color = "#ffffff";
      brush.width = 3;
      canvas.freeDrawingBrush = brush;

      // Ensure background stays black
      canvas.backgroundColor = "#000000";
      canvas.renderAll();

      // Set up text-on-path functionality
      canvas.on("before:path:created", function (opt) {
        console.log(opt);
        console.log(brushTypeRef.current);
        console.log(textSentencesRef.current);
        console.log(currentSentenceIndexRef.current);
        if (
          brushTypeRef.current === "text" &&
          textSentencesRef.current.length > 0 &&
          currentSentenceIndexRef.current < textSentencesRef.current.length
        ) {
          const path = opt.path;
          const pathInfo = fabric.util.getPathSegmentsInfo(path.path);
          console.log(pathInfo);
          path.segmentsInfo = pathInfo;
          const pathLength = pathInfo[pathInfo.length - 1].length;
          const text = textSentencesRef.current[currentSentenceIndexRef.current];
          const fontSize = (2.5 * pathLength) / text.length;
          const fText = new fabric.FabricText(text, {
            fontSize: fontSize,
            path: path,
            top: path.top,
            left: path.left,
            fill: "#ffffff",
          });
          canvas.add(fText);

          // Move to next sentence
          currentSentenceIndexRef.current += 1;
          setCurrentSentenceIndex(currentSentenceIndexRef.current);
        }
      });

      canvas.on("path:created", function (opt) {
        if (brushTypeRef.current === "text") {
          canvas.remove(opt.path);
        }
      });

      fabricCanvasInstance.current = canvas;

      // Handle window resize for mobile responsiveness
      const handleResize = () => {
        if (fabricCanvasInstance.current) {
          const isMobile = window.innerWidth <= 768;
          const canvasSize = isMobile ? Math.min(window.innerWidth - 40, 400) : 700;
          fabricCanvasInstance.current.setDimensions({
            width: canvasSize,
            height: canvasSize,
          });
        }
      };

      window.addEventListener("resize", handleResize);

      // Cleanup resize listener
      return () => {
        window.removeEventListener("resize", handleResize);
      };
    }

    // Cleanup when component unmounts or page changes
    return () => {
      if (fabricCanvasInstance.current && currentPage !== "results") {
        fabricCanvasInstance.current.dispose();
        fabricCanvasInstance.current = null;
      }
    };
  }, [currentPage, brushType, textSentences, currentSentenceIndex]);

  // Create ribbon brush when processedImage is available
  useEffect(() => {
    if (processedImage && fabricCanvasInstance.current) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        ribbonBrush.current = new RibbonBrush(
          fabricCanvasInstance.current,
          img,
          (percentage) => {
            setRibbonProgress(percentage);
          },
          (exhausted) => {
            setRibbonExhausted(exhausted);
          }
        );
      };
      img.src = processedImage;
    }
  }, [processedImage]);

  // Switch brush type
  const switchBrushType = (type) => {
    // Don't allow switching to ribbon if exhausted

    setBrushType(type);
    brushTypeRef.current = type; // Update ref for event handlers

    if (fabricCanvasInstance.current) {
      if (type === "pencil") {
        const brush = new fabric.PencilBrush(fabricCanvasInstance.current);
        brush.color = "#ffffff";
        brush.width = 3;
        fabricCanvasInstance.current.freeDrawingBrush = brush;
      } else if (type === "ribbon" && ribbonBrush.current) {
        fabricCanvasInstance.current.freeDrawingBrush = ribbonBrush.current;
      } else if (type === "text") {
        const brush = new fabric.PencilBrush(fabricCanvasInstance.current);
        brush.color = "#ffffff";
        brush.width = 1;
        fabricCanvasInstance.current.freeDrawingBrush = brush;
      }
    }
  };

  // Convert HEIC to JPEG
  const convertHeicToJpeg = async (file) => {
    if (file.type === "image/heic" || file.name.toLowerCase().endsWith(".heic")) {
      try {
        const convertedBlob = await heicTo({
          blob: file,
          type: "image/jpeg",
          quality: 0.8,
        });

        // Create a new File object from the converted blob
        const convertedFile = new File([convertedBlob], file.name.replace(/\.heic$/i, ".jpg"), {
          type: "image/jpeg",
          lastModified: Date.now(),
        });

        return convertedFile;
      } catch (error) {
        console.error("Error converting HEIC to JPEG:", error);
        return file; // Return original file if conversion fails
      }
    }
    return file; // Return original file if not HEIC
  };

  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (file) {
      const convertedFile = await convertHeicToJpeg(file);
      setSelectedImage(convertedFile);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target.result);
      };
      reader.readAsDataURL(convertedFile);
    }
  };

  const handleImageDrop = async (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && (file.type.startsWith("image/") || file.name.toLowerCase().endsWith(".heic"))) {
      const convertedFile = await convertHeicToJpeg(file);
      setSelectedImage(convertedFile);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target.result);
      };
      reader.readAsDataURL(convertedFile);
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
  };

  const clearImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setProcessedImage(null);
    setCurrentPage("upload");
  };

  const clearText = () => {
    setTextContent("");
  };

  const matToImageData = (mat) => {
    const canvas = document.createElement("canvas");
    cv.imshow(canvas, mat);
    return canvas.toDataURL();
  };

  const extractHandwriting = async () => {
    setIsProcessing(true);
    setLoadingProgress(0);
    setProcessedImage(null);

    // If there's no image, skip image processing and go to results
    if (!selectedImage) {
      setLoadingProgress(100);
      setCurrentPage("results");
      setIsProcessing(false);
      return;
    }

    try {
      // Load image
      const img = new Image();
      img.onload = () => {
        setLoadingProgress(10);
        // Create canvas to get image data
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");

        // Scale image down (similar to Python's 18% scale)
        const scale = 0.18;
        const scaledWidth = Math.floor(img.width * scale);
        const scaledHeight = Math.floor(img.height * scale);

        canvas.width = scaledWidth;
        canvas.height = scaledHeight;
        ctx.drawImage(img, 0, 0, scaledWidth, scaledHeight);

        // Get image data and create OpenCV matrix
        const imageData = ctx.getImageData(0, 0, scaledWidth, scaledHeight);
        const src = cv.matFromImageData(imageData);
        setLoadingProgress(20);

        // Convert to grayscale
        const gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        setLoadingProgress(30);

        // Apply median blur
        const blurred = new cv.Mat();
        cv.medianBlur(gray, blurred, 5);
        setLoadingProgress(40);

        // Apply adaptive threshold
        const thresh = new cv.Mat();
        cv.adaptiveThreshold(
          blurred,
          thresh,
          255,
          cv.ADAPTIVE_THRESH_GAUSSIAN_C,
          cv.THRESH_BINARY_INV,
          5,
          5
        );
        setLoadingProgress(50);

        // Save debug image - thresholded
        const debugImages = {};
        debugImages.thresholded = matToImageData(thresh);
        setLoadingProgress(60);

        // Create morphological kernel for line detection
        const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(16, 2));
        const dilated = new cv.Mat();
        cv.dilate(thresh, dilated, kernel, new cv.Point(-1, -1), 2);
        setLoadingProgress(70);

        // Find contours
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        setLoadingProgress(80);

        // Process each contour (text line)
        const processedLines = [];
        for (let i = 0; i < contours.size(); i++) {
          const contour = contours.get(i);
          const rect = cv.boundingRect(contour);

          // Skip very small contours
          if (rect.width < 10 || rect.height < 5) continue;

          // Extract region of interest from original grayscale image
          const roi = gray.roi(rect);

          // Apply light gaussian blur
          const filtered = new cv.Mat();
          cv.GaussianBlur(roi, filtered, new cv.Size(3, 3), 0);

          // Apply adaptive threshold for handwriting extraction
          const handwritingThresh = new cv.Mat();
          cv.adaptiveThreshold(
            filtered,
            handwritingThresh,
            255,
            cv.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv.THRESH_BINARY,
            7,
            4
          );

          // Create 4-channel image for transparency with white handwriting
          const channels = new cv.MatVector();

          // Create white handwriting by inverting the threshold for RGB channels
          const whiteHandwriting = new cv.Mat();
          cv.bitwise_not(handwritingThresh, whiteHandwriting);

          channels.push_back(whiteHandwriting); // Blue channel (white)
          channels.push_back(whiteHandwriting); // Green channel (white)
          channels.push_back(whiteHandwriting); // Red channel (white)

          // Create alpha channel (inverted threshold - handwriting visible, background transparent)
          const alpha = new cv.Mat();
          cv.bitwise_not(handwritingThresh, alpha);
          channels.push_back(alpha);

          const transparent = new cv.Mat();
          cv.merge(channels, transparent);

          processedLines.push({
            image: matToImageData(transparent),
            rect: rect,
            index: i,
          });

          // Clean up
          roi.delete();
          filtered.delete();
          handwritingThresh.delete();
          whiteHandwriting.delete();
          alpha.delete();
          transparent.delete();
          channels.delete();
        }

        // Sort lines by y-coordinate (top to bottom)
        processedLines.sort((a, b) => a.rect.y - b.rect.y);

        // Create concatenated image (skip the first/largest contour which is usually the whole image)
        if (processedLines.length > 1) {
          // Find the largest contour (by area) and skip it
          const largestContourIndex = processedLines.reduce((maxIndex, line, index) => {
            const area = line.rect.width * line.rect.height;
            const maxArea =
              processedLines[maxIndex].rect.width * processedLines[maxIndex].rect.height;
            return area > maxArea ? index : maxIndex;
          }, 0);

          // Filter out the largest contour
          const linesToConcatenate = processedLines.filter(
            (_, index) => index !== largestContourIndex
          );

          if (linesToConcatenate.length > 0) {
            // Find max height
            const maxHeight = Math.max(...linesToConcatenate.map((line) => line.rect.height));
            const totalWidth = linesToConcatenate.reduce((sum, line) => sum + line.rect.width, 0);

            // Create canvas for concatenated image
            const concatCanvas = document.createElement("canvas");
            concatCanvas.width = totalWidth;
            concatCanvas.height = maxHeight;
            const concatCtx = concatCanvas.getContext("2d");

            // Draw each line
            let currentX = 0;
            linesToConcatenate.forEach((line) => {
              const lineImg = new Image();
              lineImg.onload = () => {
                concatCtx.drawImage(lineImg, currentX, 0);
                currentX += line.rect.width;
              };
              lineImg.src = line.image;
            });

            // Set concatenated image after a short delay to ensure all images are loaded
            setTimeout(() => {
              setProcessedImage(concatCanvas.toDataURL());
              setLoadingProgress(100);
              setCurrentPage("results");
            }, 100);
          }
        }

        setLoadingProgress(90);

        // Clean up
        src.delete();
        gray.delete();
        blurred.delete();
        thresh.delete();
        kernel.delete();
        dilated.delete();
        contours.delete();
        hierarchy.delete();

        setIsProcessing(false);
      };

      img.src = imagePreview;
    } catch (error) {
      console.error("Error processing image:", error);
      setIsProcessing(false);
    }
  };

  const goBack = () => {
    setCurrentPage("upload");
  };

  // Export canvas to image
  const shareCanvas = () => {
    if (fabricCanvasInstance.current) {
      const canvas = fabricCanvasInstance.current;

      // Export canvas as image data
      const dataURL = canvas.toDataURL({
        format: "png",
        quality: 1.0,
        multiplier: 2, // Higher resolution
      });

      // Create download link
      const link = document.createElement("a");
      link.download = `journal-draw-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataURL;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Loading overlay component
  const LoadingOverlay = () => (
    <div className="loading-overlay">
      <div className="loading-content">
        <div className="loading-title">[PROCESSING HANDWRITING]</div>
        <div className="loading-bar">
          <div className="loading-progress" style={{ width: `${loadingProgress}%` }}></div>
        </div>
        <div className="loading-text">{loadingProgress}% COMPLETE</div>
      </div>
    </div>
  );

  return (
    <div className="app">
      {isProcessing && <LoadingOverlay />}
      <div className="terminal-header">
        <div className="header-text">
          draw with your <span className="accent">journal entries</span>
        </div>
        <div className="status-bar">(づ๑•ᴗ•๑)づ♡ {new Date().toLocaleTimeString()}</div>
      </div>

      <div className="main-content">
        {currentPage === "upload" && (
          <div className="upload-container">
            <div className="section">
              <div className="section-header">
                <span className="section-title">
                  [IMAGES OF YOUR <span className="accent">PHYSICAL JOURNAL ENTRIES</span>]
                </span>
                <div className="section-header-right">
                  <span className="info-icon">
                    i
                    <div className="info-tooltip">
                      <div className="tooltip-title">[UPLOAD GUIDELINES]</div>
                      <ul className="tooltip-list">
                        <li>SUPPORTED FORMATS: JPG, PNG, HEIC, WEBP</li>
                        <li>OPTIMAL: HIGH CONTRAST DARK TEXT ON LIGHT BACKGROUND</li>
                        <li>ONLY THE PAGE (NO BACKGROUND)</li>
                        <li>MAKE SURE LINES OF TEXT ARE STRAIGHT</li>
                        <li>AVOID: BLURRY OR LOW RESOLUTION IMAGES</li>
                      </ul>
                    </div>
                  </span>
                  {selectedImage && (
                    <button className="clear-btn" onClick={clearImage}>
                      [CLEAR]
                    </button>
                  )}
                </div>
              </div>

              <div
                className="image-upload-area"
                onDrop={handleImageDrop}
                onDragOver={handleDragOver}
              >
                {imagePreview ? (
                  <div className="image-preview">
                    <img src={imagePreview} alt="Preview" className="preview-image" />
                    <div className="image-info">
                      FILE: {selectedImage.name}
                      <br />
                      SIZE: {(selectedImage.size / 1024).toFixed(2)} KB
                      <br />
                      TYPE: {selectedImage.type}
                    </div>
                  </div>
                ) : (
                  <div className="upload-placeholder">
                    <div className="upload-icon">📁</div>
                    <div className="upload-text">
                      DRAG & DROP IMAGE HERE
                      <br />
                      OR CLICK TO SELECT
                    </div>
                  </div>
                )}

                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="file-input"
                />
              </div>
            </div>

            <div className="section">
              <div className="section-header">
                <span className="section-title">
                  [TEXT FROM YOUR <span className="accent">DIGITAL JOURNAL ENTRIES</span>]
                </span>
                {textContent && (
                  <button className="clear-btn" onClick={clearText}>
                    [CLEAR]
                  </button>
                )}
              </div>

              <div className="text-input-area">
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder="ENTER YOUR TEXT DATA..."
                  className="text-input"
                  rows="8"
                />
                <div className="text-info">
                  CHARACTERS: {textContent.length} | LINES: {textContent.split("\n").length}
                </div>
              </div>
            </div>

            <div className="action-panel">
              <button
                className="action-btn"
                disabled={(!selectedImage && !textContent) || isProcessing}
                onClick={extractHandwriting}
              >
                {isProcessing ? "[PROCESSING...]" : "[PROCESS DATA]"}
              </button>
              <button
                className="action-btn secondary"
                onClick={() => {
                  clearImage();
                  clearText();
                }}
              >
                [CLEAR ALL]
              </button>
            </div>
          </div>
        )}

        {currentPage === "results" && (
          <div className="results-container">
            <div className="actions">
              <button className="clear-btn" onClick={goBack}>
                [BACK TO UPLOAD]
              </button>
            </div>

            {/* Debug Images Section
            {Object.keys(debugImages).length > 0 && (
              <div className="section">
                <div className="section-header">
                  <span className="section-title">[DEBUG IMAGES]</span>
                </div>
                <div className="debug-images">
                  {Object.entries(debugImages).map(([key, imageSrc]) => (
                    <div key={key} className="debug-image">
                      <div className="debug-image-title">{key.toUpperCase()}</div>
                      <img src={imageSrc} alt={key} className="debug-image-preview" />
                    </div>
                  ))}
                </div>
              </div>
            )} */}

            {/* Processed Image Section */}
            {processedImage && (
              <div className="section">
                <div className="section-header">
                  <span className="section-title">[EXTRACTED HANDWRITING]</span>
                </div>
                <div className="processed-image">
                  <img
                    src={processedImage}
                    alt="Extracted Handwriting"
                    className="processed-image-preview"
                  />
                </div>
              </div>
            )}

            {/* Drawing Canvas Section */}
            <div className="section">
              <div className="section-header">
                <span className="section-title">[NOW DRAW!]</span>
                <div className="canvas-controls">
                  <div className="brush-selector">
                    <button
                      className={`brush-btn ${brushType === "ribbon" ? "active" : ""}`}
                      onClick={() => switchBrushType("ribbon")}
                      disabled={!processedImage}
                    >
                      <span className="brush-icon">✎</span>
                      <br />
                      [WRITE]
                    </button>
                    <button
                      className={`brush-btn ${brushType === "text" ? "active" : ""}`}
                      onClick={() => switchBrushType("text")}
                      disabled={!textContent}
                    >
                      <span className="brush-icon">🇦</span>
                      <br />
                      [TYPE]
                    </button>
                    <button
                      className={`brush-btn ${brushType === "pencil" ? "active" : ""}`}
                      onClick={() => switchBrushType("pencil")}
                    >
                      <span className="brush-icon">ᝰ</span>
                      <br />
                      [DRAW]
                    </button>
                  </div>
                  {brushType === "ribbon" && (
                    <div className="ribbon-progress">
                      <span>
                        {ribbonExhausted
                          ? "WRITING EXHAUSTED"
                          : `WRITING PROGRESS: ${ribbonProgress}%`}
                      </span>
                      <button
                        className="reset-btn"
                        onClick={() => {
                          if (ribbonBrush.current) {
                            ribbonBrush.current.reset();
                          }
                        }}
                      >
                        [RESET]
                      </button>
                    </div>
                  )}
                  {brushType === "text" && textSentences.length > 0 && (
                    <div className="text-status">
                      {currentSentenceIndex < textSentences.length ? (
                        <span>SENTENCES: {textSentences.length - currentSentenceIndex} LEFT</span>
                      ) : (
                        <span>
                          NO SENTENCES LEFT -
                          <button className="reset-btn" onClick={() => setCurrentSentenceIndex(0)}>
                            [RESET]
                          </button>
                        </span>
                      )}
                    </div>
                  )}
                  <button
                    className="clear-btn"
                    onClick={() => {
                      if (fabricCanvasInstance.current) {
                        fabricCanvasInstance.current.clear();
                        fabricCanvasInstance.current.backgroundColor = "#000000";
                        fabricCanvasInstance.current.setBackgroundColor("#000000");
                        fabricCanvasInstance.current.renderAll();
                      }
                    }}
                  >
                    [CLEAR CANVAS]
                  </button>
                  <button
                    className="share-btn"
                    onClick={shareCanvas}
                    disabled={!fabricCanvasInstance.current}
                  >
                    [SHARE]
                  </button>
                </div>
              </div>
              <div className="canvas-container">
                <canvas ref={fabricCanvasRef} />
              </div>
            </div>

            <div className="action-panel">
              <button
                className="action-btn"
                onClick={() => {
                  clearImage();
                  clearText();
                }}
              >
                [RESTART]
              </button>
              <button className="action-btn secondary" onClick={goBack}>
                [CHANGE INPUTS]
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="footer">
        <div className="footer-text">
          STATUS: {isProcessing ? "PROCESSING" : "OPERATIONAL"} | built with{" "}
          <a
            className="emoji-icon accent"
            target="_blank"
            href="https://github.com/49emily/journal-draw"
          >
            ✎
          </a>
        </div>
      </div>

      {/* Hidden canvas for image processing */}
      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}

export default App;
