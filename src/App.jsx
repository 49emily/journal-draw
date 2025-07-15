import { useState, useRef, useEffect } from "react";
import * as fabric from "fabric";
import cv from "@techstark/opencv-js";
import { heicTo } from "heic-to";
import RibbonBrush from "./RibbonBrush";
import "./App.css";

function App() {
  const [selectedImages, setSelectedImages] = useState([]); // Changed from selectedImage to selectedImages array
  const [imagePreviews, setImagePreviews] = useState([]); // Changed from imagePreview to imagePreviews array
  const [textContent, setTextContent] = useState("");
  const [processedImage, setProcessedImage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentPage, setCurrentPage] = useState("upload"); // "upload" or "results"
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [brushType, setBrushType] = useState("pencil"); // "pencil", "ribbon", or "text"
  const [textSentences, setTextSentences] = useState([]);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
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
    console.log("brushType", brushType);
    console.log("fabricCanvasInstance", fabricCanvasInstance.current);
    console.log("ribbonBrush", ribbonBrush.current);
    brushTypeRef.current = brushType;

    if (fabricCanvasInstance.current) {
      if (brushType === "pencil") {
        const brush = new fabric.PencilBrush(fabricCanvasInstance.current);
        brush.color = "#ffffff";
        brush.width = 3;
        fabricCanvasInstance.current.freeDrawingBrush = brush;
      } else if (brushType === "ribbon" && ribbonBrush.current) {
        fabricCanvasInstance.current.freeDrawingBrush = ribbonBrush.current;
      } else if (brushType === "text") {
        const brush = new fabric.PencilBrush(fabricCanvasInstance.current);
        brush.color = "#ffffff";
        brush.width = 1;
        fabricCanvasInstance.current.freeDrawingBrush = brush;
      }
    }
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
        console.log("setting ribbon brush");
        setBrushType("ribbon");
      } else if (textContent) {
        setBrushType("text");
      } else {
        setBrushType("pencil");
      }
    }
  }, [currentPage]);

  // Initialize Fabric canvas
  useEffect(() => {
    console.log("calling init fabric canvas");
    console.log(brushType);
    if (currentPage === "results" && fabricCanvasRef.current && !fabricCanvasInstance.current) {
      // Calculate canvas size based on screen width
      const isMobile = window.innerWidth <= 768;
      const canvasWidth = isMobile ? Math.min(window.innerWidth - 40, 400) : 700;
      const canvasHeight = isMobile ? canvasWidth * 1.5 : 700; // Make mobile canvas taller

      const canvas = new fabric.Canvas(fabricCanvasRef.current, {
        width: canvasWidth,
        height: canvasHeight,
        backgroundColor: "#000000",
        isDrawingMode: true,
      });

      // Ensure background stays black
      canvas.backgroundColor = "#000000";
      canvas.renderAll();

      // Set up text-on-path functionality
      canvas.on("before:path:created", function (opt) {
        if (brushTypeRef.current === "text" && textSentencesRef.current.length > 0) {
          const path = opt.path;
          const pathInfo = fabric.util.getPathSegmentsInfo(path.path);
          console.log(pathInfo);
          path.segmentsInfo = pathInfo;
          const pathLength = pathInfo[pathInfo.length - 1].length;
          const text =
            textSentencesRef.current[
              currentSentenceIndexRef.current % textSentencesRef.current.length
            ];
          const fontSize = (2.5 * pathLength) / text.length;
          const fText = new fabric.FabricText(text, {
            fontSize: fontSize,
            path: path,
            top: path.top,
            left: path.left,
            fill: "#ffffff",
          });
          canvas.add(fText);

          // Move to next sentence (loop back to beginning when reaching end)
          currentSentenceIndexRef.current =
            (currentSentenceIndexRef.current + 1) % textSentencesRef.current.length;
          setCurrentSentenceIndex(currentSentenceIndexRef.current);
        }
      });

      canvas.on("path:created", function (opt) {
        if (brushTypeRef.current === "text") {
          canvas.remove(opt.path);
        }
      });

      fabricCanvasInstance.current = canvas;

      // Set up initial brush based on current brush type
      if (brushType === "pencil") {
        const brush = new fabric.PencilBrush(canvas);
        brush.color = "#ffffff";
        brush.width = 3;
        canvas.freeDrawingBrush = brush;
      } else if (brushType === "ribbon" && ribbonBrush.current) {
        canvas.freeDrawingBrush = ribbonBrush.current;
      } else if (brushType === "text") {
        const brush = new fabric.PencilBrush(canvas);
        brush.color = "#ffffff";
        brush.width = 1;
        canvas.freeDrawingBrush = brush;
      }

      // Handle window resize for mobile responsiveness
      const handleResize = () => {
        if (fabricCanvasInstance.current) {
          const isMobile = window.innerWidth <= 768;
          const canvasWidth = isMobile ? Math.min(window.innerWidth - 40, 400) : 700;
          const canvasHeight = isMobile ? canvasWidth * 1.5 : 700; // Make mobile canvas taller
          fabricCanvasInstance.current.setDimensions({
            width: canvasWidth,
            height: canvasHeight,
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
        ribbonBrush.current = new RibbonBrush(fabricCanvasInstance.current, img);
        // If currently using ribbon brush, update the canvas brush
        if (brushType === "ribbon") {
          fabricCanvasInstance.current.freeDrawingBrush = ribbonBrush.current;
        }
      };
      img.src = processedImage;
    }
  }, [processedImage, brushType]);

  // Switch brush type
  const switchBrushType = (type) => {
    setBrushType(type);
  };

  // Convert HEIC to JPEG
  const convertHeicToJpeg = async (file) => {
    console.log("converting heic to jpeg");
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
    const files = Array.from(event.target.files);
    const availableSlots = 4 - selectedImages.length;
    const filesToProcess = files.slice(0, availableSlots);

    for (const file of filesToProcess) {
      const convertedFile = await convertHeicToJpeg(file);
      setSelectedImages((prev) => [...prev, convertedFile]);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreviews((prev) => [...prev, e.target.result]);
      };
      reader.readAsDataURL(convertedFile);
    }
  };

  const handleImageDrop = async (event) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    const availableSlots = 4 - selectedImages.length;
    const filesToProcess = files
      .filter((file) => file.type.startsWith("image/") || file.name.toLowerCase().endsWith(".heic"))
      .slice(0, availableSlots);

    for (const file of filesToProcess) {
      const convertedFile = await convertHeicToJpeg(file);
      setSelectedImages((prev) => [...prev, convertedFile]);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreviews((prev) => [...prev, e.target.result]);
      };
      reader.readAsDataURL(convertedFile);
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
  };

  const clearImage = () => {
    setSelectedImages([]);
    setImagePreviews([]);
    setProcessedImage(null);
    setCurrentPage("upload");
  };

  const removeImage = (index) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
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
    if (!selectedImages.length) {
      setLoadingProgress(100);
      setCurrentPage("results");
      setIsProcessing(false);
      return;
    }

    try {
      const allProcessedLines = [];
      const totalImages = selectedImages.length;

      // Process each image
      for (let imageIndex = 0; imageIndex < totalImages; imageIndex++) {
        const progressStart = (imageIndex / totalImages) * 80;
        const progressEnd = ((imageIndex + 1) / totalImages) * 80;

        setLoadingProgress(progressStart);

        const img = new Image();
        await new Promise((resolve) => {
          img.onload = () => {
            // Create canvas to get image data
            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d");

            console.log("img.width", img.width);
            console.log("img.height", img.height);

            // Draw image at original size to canvas
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            // Get image data and create OpenCV matrix
            const imageData = ctx.getImageData(0, 0, img.width, img.height);
            const src = cv.matFromImageData(imageData);

            // Scale using OpenCV (like Python script)
            const scaledWidth = 550;
            const scale = scaledWidth / img.width;
            const scaledHeight = Math.floor(img.height * scale);

            const scaled = new cv.Mat();
            cv.resize(src, scaled, new cv.Size(scaledWidth, scaledHeight), 0, 0, cv.INTER_AREA);

            // Convert to grayscale
            const gray = new cv.Mat();
            cv.cvtColor(scaled, gray, cv.COLOR_RGBA2GRAY);

            // Apply median blur
            const blurred = new cv.Mat();
            cv.medianBlur(gray, blurred, 5);

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

            // Create morphological kernel for line detection
            const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(16, 2));
            const dilated = new cv.Mat();
            cv.dilate(thresh, dilated, kernel, new cv.Point(-1, -1), 2);

            // Find contours
            const contours = new cv.MatVector();
            const hierarchy = new cv.Mat();
            cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

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
                imageIndex: imageIndex,
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

            // Filter out the largest contour (usually the whole image)
            if (processedLines.length > 1) {
              const largestContourIndex = processedLines.reduce((maxIndex, line, index) => {
                const area = line.rect.width * line.rect.height;
                const maxArea =
                  processedLines[maxIndex].rect.width * processedLines[maxIndex].rect.height;
                return area > maxArea ? index : maxIndex;
              }, 0);

              const linesToAdd = processedLines.filter((_, index) => index !== largestContourIndex);

              allProcessedLines.push(...linesToAdd);
            }

            // Clean up
            src.delete();
            gray.delete();
            blurred.delete();
            thresh.delete();
            kernel.delete();
            dilated.delete();
            contours.delete();
            hierarchy.delete();

            setLoadingProgress(progressEnd);
            resolve();
          };
          img.src = imagePreviews[imageIndex];
        });
      }

      setLoadingProgress(85);

      // Concatenate all processed lines from all images
      if (allProcessedLines.length > 0) {
        // Find max height across all lines
        const maxHeight = Math.max(...allProcessedLines.map((line) => line.rect.height));
        const totalWidth = allProcessedLines.reduce((sum, line) => sum + line.rect.width, 0);

        // Create canvas for final concatenated image
        const finalCanvas = document.createElement("canvas");
        finalCanvas.width = totalWidth;
        finalCanvas.height = maxHeight;
        const finalCtx = finalCanvas.getContext("2d");

        // Draw each line sequentially
        let currentX = 0;
        let loadedImages = 0;

        allProcessedLines.forEach((line) => {
          const lineImg = new Image();
          lineImg.onload = () => {
            finalCtx.drawImage(lineImg, currentX, 0);
            currentX += line.rect.width;
            loadedImages++;

            // When all images are loaded, set the final result
            if (loadedImages === allProcessedLines.length) {
              setProcessedImage(finalCanvas.toDataURL());
              setLoadingProgress(100);
              setCurrentPage("results");
              setIsProcessing(false);
            }
          };
          lineImg.src = line.image;
        });
      } else {
        // No lines found, still go to results
        setLoadingProgress(100);
        setCurrentPage("results");
        setIsProcessing(false);
      }
    } catch (error) {
      console.error("Error processing images:", error);
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
        <div className="header-text" onClick={() => setCurrentPage("upload")}>
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
                  [IMAGE(S) OF YOUR <span className="accent">PHYSICAL JOURNAL ENTRIES</span>]
                </span>
                <div className="section-header-right">
                  <span className="info-icon">
                    i
                    <div className="info-tooltip">
                      <div className="tooltip-title">[UPLOAD GUIDELINES]</div>
                      <ul className="tooltip-list">
                        <li>SUPPORTED FORMATS: JPG, PNG, HEIC, WEBP</li>
                        <li>ONLY THE PAGE (NO BACKGROUND) !!!</li>
                        <li>MAKE SURE LINES OF TEXT ARE STRAIGHT</li>
                        <li>OPTIMAL: HIGH CONTRAST DARK TEXT ON LIGHT BACKGROUND</li>
                      </ul>
                    </div>
                  </span>
                  {selectedImages.length > 0 && (
                    <button className="clear-btn" onClick={clearImage}>
                      [CLEAR ALL]
                    </button>
                  )}
                </div>
              </div>

              <div
                className="image-upload-area"
                onDrop={handleImageDrop}
                onDragOver={handleDragOver}
              >
                {imagePreviews.length > 0 ? (
                  <div className="image-preview-container">
                    {imagePreviews.map((preview, index) => (
                      <div key={index} className="image-preview-item">
                        <img src={preview} alt={`Preview ${index + 1}`} className="preview-image" />
                        <div className="image-info">
                          FILE: {selectedImages[index]?.name || `Image ${index + 1}`}
                          <br />
                          SIZE: {(selectedImages[index]?.size / 1024).toFixed(2)} KB
                          <br />
                          TYPE: {selectedImages[index]?.type}
                        </div>
                        <button className="remove-image-btn" onClick={() => removeImage(index)}>
                          ×
                        </button>
                      </div>
                    ))}
                    {selectedImages.length < 4 && (
                      <div className="upload-placeholder small">
                        <div className="upload-icon">+</div>
                        <div className="upload-text">
                          ADD MORE
                          <br />({selectedImages.length}/4)
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="upload-placeholder">
                    <div className="upload-icon">📁</div>
                    <div className="upload-text">
                      DRAG & DROP IMAGES HERE
                      <br />
                      OR CLICK TO SELECT (UP TO 4)
                    </div>
                  </div>
                )}

                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="file-input"
                  multiple // Allow multiple file selection
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
                disabled={(!selectedImages.length && !textContent) || isProcessing}
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
            {/* {processedImage && (
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
            )} */}

            {/* Drawing Canvas Section */}
            <div className="section">
              <div className="section-header">
                <span className="section-title">
                  [NOW <span className="accent">DRAW!</span>]
                </span>
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
          <a className="github-icon" target="_blank" href="https://github.com/49emily/journal-draw">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
        </div>
      </div>

      {/* Hidden canvas for image processing */}
      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}

export default App;
