import * as fabric from "fabric";

class RibbonBrush extends fabric.BaseBrush {
  constructor(canvas, image, onProgress) {
    super(canvas);
    this.image = image;
    this.sliceWidth = 20;
    this.slices = [];
    this.currentSliceIndex = 0;
    this.path = [];
    this.onProgress = onProgress;
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
      const percentage = Math.round(
        ((this.currentSliceIndex % this.slices.length) / this.slices.length) * 100
      );
      this.onProgress(percentage);
    }
  }

  onMouseDown(pointer) {
    this.path = [pointer];
    this.canvas.requestRenderAll();
  }

  onMouseMove(pointer) {
    if (this.path.length > 0) {
      this.path.push(pointer);
      this.drawSliceAtPoint(pointer);
      this.canvas.requestRenderAll();
    }
  }

  onMouseUp() {
    this.path = [];
  }

  drawSliceAtPoint(point) {
    if (this.slices.length === 0) return;

    // Loop back to beginning when we reach the end
    const sliceIndex = this.currentSliceIndex % this.slices.length;
    const slice = this.slices[sliceIndex];

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
    this.updateProgress();
  }
}

export default RibbonBrush;
