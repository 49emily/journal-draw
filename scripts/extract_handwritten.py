import os
import cv2
import numpy as np
import math


def rotate_image(image, angle):
    """
    Rotates the given image by the input angle in the counter-clockwise direction
    Parameters
    ----------
        image : ndim np.array
            image to be rotated
        angle : float
            angle of rotation as degrees.
    Returns
    -------
        rotated image as np.array
    """
    # create an tuple that contains height/2, width/2
    image_center = tuple(np.array(image.shape[1::-1]) / 2)
    # rot_mat 2x3 rotation mattrix
    rot_mat = cv2.getRotationMatrix2D(image_center, angle, 1.0)
    # apply the affine transformation to the image
    # size of the output image image.shape[1::-1]
    result = cv2.warpAffine(image, rot_mat, image.shape[1::-1], flags=cv2.INTER_LINEAR)
    return result


def read_image(img_path):
    image = cv2.imread(img_path)

    scale_percent = 18  # percent of original size
    # width = int(image.shape[1] * scale_percent / 100)
    # height = int(image.shape[0] * scale_percent / 100)
    width = 550
    height = int(image.shape[0] * width / image.shape[1])
    dim = (width, height)
    rescaled_img = cv2.resize(image, dim, interpolation=cv2.INTER_AREA)
    return image, rescaled_img


def save_img(dir_path, filename, img):
    """
    dir_path - directory path where the image will be saved
    filename - requires a valid image format
    img - image to be saved
    """
    file_path = os.path.join(dir_path, filename)
    cv2.imwrite(file_path, img)


def find_text_angle(dilated_img, org_img):
    """
    org_img - original image
    img - dilated img
    """
    lines = cv2.HoughLinesP(
        dilated_img,
        rho=1,
        theta=np.pi / 180,
        threshold=30,
        minLineLength=5,
        maxLineGap=20,
    )

    nb_lines = len(lines)
    angle = 0

    for line in lines:
        x1, y1, x2, y2 = line[0]
        angle += math.atan2((y2 - y1), (x2 - x1))

    angle /= nb_lines

    rotated = rotate_image(org_img, angle - 1)
    rot_dilated = rotate_image(dilated_img, angle - 1)

    return rotated, rot_dilated


def extract_text_lines(img, output_dir):
    """
    img - image from which the text lines are extracted
    output_dir - directory where the extracted lines should be saved
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blur = cv2.medianBlur(gray, 5)
    thresh = cv2.adaptiveThreshold(
        blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 5, 5
    )

    # Save the thresholded image to see the preprocessing result
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    save_img(output_dir, "thresholded.jpg", thresh)

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (16, 2))
    dilate = cv2.dilate(thresh, kernel, iterations=2)
    rotated, rot_dilated = find_text_angle(dilate, img)

    cnts = cv2.findContours(rot_dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if len(cnts) == 2:
        cnts = cnts[0]
    else:
        cnts = cnts[1]

    lines_path = os.path.join(output_dir, "lines")

    if not os.path.exists(lines_path):
        os.makedirs(lines_path)

    for line_idx, line in enumerate(cnts, start=-len(cnts)):
        x, y, w, h = cv2.boundingRect(line)
        roi = rotated[y : y + h, x : x + w]
        filename = "line" + str(line_idx) + ".jpg"
        save_img(lines_path, filename=filename, img=roi)


def extract_handwriting_png(output_dir):
    """
    Processes each line image to extract handwriting as PNG with transparent background
    output_dir - directory containing the extracted line images
    """
    lines_path = os.path.join(output_dir, "lines")
    png_path = os.path.join(output_dir, "handwriting_png")

    if not os.path.exists(lines_path):
        print(f"Lines directory not found: {lines_path}")
        return

    if not os.path.exists(png_path):
        os.makedirs(png_path)

    # List to store processed images for concatenation
    processed_images = []

    # Get all jpg files and sort them by line number
    jpg_files = [f for f in os.listdir(lines_path) if f.endswith(".jpg")]
    jpg_files.sort(key=lambda x: int(x.split("-")[1].split(".")[0]))

    # Process each line image
    for filename in jpg_files:
        line_img_path = os.path.join(lines_path, filename)
        line_img = cv2.imread(line_img_path)

        if line_img is None:
            continue

        # Convert to grayscale
        gray = cv2.cvtColor(line_img, cv2.COLOR_BGR2GRAY)

        # Try different filtering approaches for better handwriting clarity

        # Option 1: Light Gaussian blur (less aggressive than bilateral)
        filtered_gaussian = cv2.GaussianBlur(gray, (3, 3), 0)

        # Option 2: Median blur (good for salt-and-pepper noise)
        filtered_median = cv2.medianBlur(gray, 1)
        filtered_two_median = cv2.medianBlur(filtered_median, 1)

        # # Option 3: No filtering (raw grayscale)
        # filtered_none = gray

        # # Option 4: Bilateral filter with lighter parameters
        # filtered_bilateral = cv2.bilateralFilter(gray, 5, 50, 50)

        # Save all filtered versions to compare
        # cv2.imwrite(
        #     os.path.join(png_path, filename.replace(".jpg", "_gaussian.jpg")),
        #     filtered_gaussian,
        # )
        # cv2.imwrite(
        #     os.path.join(png_path, filename.replace(".jpg", "_median.jpg")),
        #     filtered_median,
        # )
        # cv2.imwrite(
        #     os.path.join(png_path, filename.replace(".jpg", "_none.jpg")),
        #     filtered_none,
        # )
        # cv2.imwrite(
        #     os.path.join(png_path, filename.replace(".jpg", "_bilateral.jpg")),
        #     filtered_bilateral,
        # )

        # Use median blur for final processing (good balance of noise reduction and edge preservation)
        filtered = filtered_gaussian

        # Apply adaptive thresholding with better parameters for handwriting
        thresh = cv2.adaptiveThreshold(
            filtered, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 7, 4
        )

        # # Apply morphological operations to clean up the result
        # kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2, 2))
        # thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
        # thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)

        # Save thresholded image to see the result
        thresh_filename = filename.replace(".jpg", "_thresh.jpg")
        thresh_file_path = os.path.join(png_path, thresh_filename)
        cv2.imwrite(thresh_file_path, thresh)

        # Create 4-channel image (BGRA) for transparency
        h, w = thresh.shape
        transparent_img = np.zeros((h, w, 4), dtype=np.uint8)

        # Where thresh is black (0), make it transparent (alpha = 0)
        # Where thresh is white (255), make it black handwriting (alpha = 255)
        transparent_img[:, :, 0] = 255  # Blue channel
        transparent_img[:, :, 1] = 255  # Green channel
        transparent_img[:, :, 2] = 255  # Red channel
        transparent_img[:, :, 3] = 255 - thresh  # Alpha channel (inverted threshold)

        # Save as PNG with transparency
        png_filename = filename.replace(".jpg", ".png")
        png_file_path = os.path.join(png_path, png_filename)
        cv2.imwrite(png_file_path, transparent_img)

        # Store the processed image for concatenation (skip line-1 as it's the whole image)
        line_number = int(filename.split("-")[1].split(".")[0])
        if line_number != 1:
            processed_images.append(transparent_img)

        print(f"Processed: {filename} -> {png_filename}")

    # Concatenate all processed images horizontally
    if processed_images:
        # Find the maximum height among all images
        max_height = max(img.shape[0] for img in processed_images)

        # Pad all images to the same height
        padded_images = []
        for img in processed_images:
            if img.shape[0] < max_height:
                # Create padding with transparent pixels
                pad_height = max_height - img.shape[0]
                pad = np.zeros((pad_height, img.shape[1], 4), dtype=np.uint8)
                padded_img = np.vstack([img, pad])
                padded_images.append(padded_img)
            else:
                padded_images.append(img)

        # Concatenate horizontally
        concatenated = np.hstack(padded_images)

        # Save the concatenated image
        concatenated_path = os.path.join(output_dir, "concatenated_handwriting.png")
        cv2.imwrite(concatenated_path, concatenated)

        print(f"Created concatenated image: {concatenated_path}")
        print(
            f"Concatenated image dimensions: {concatenated.shape[1]} x {concatenated.shape[0]}"
        )


def extract_text_chars(img, output_dir):
    """
    img - image from which the individual chars are extracted
    output_dir - directory where the extracted lines should be saved
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blur = cv2.medianBlur(gray, 7)

    thresh = cv2.adaptiveThreshold(
        blur, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 7, 11
    )
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 7))

    dilate = cv2.dilate(thresh, kernel, iterations=1)

    cnts = cv2.findContours(dilate, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if len(cnts) == 2:
        cnts = cnts[0]
    else:
        cnts = cnts[1]

    chars_path = os.path.join(output_dir, "chars")

    if not os.path.exists(chars_path):
        os.makedirs(chars_path)

    for char_idx, character in enumerate(cnts, start=-len(cnts)):
        x, y, w, h = cv2.boundingRect(character)
        roi = img[y : y + h, x : x + w]
        filename = "char" + str(char_idx) + ".jpg"
        save_img(chars_path, filename=filename, img=roi)


if __name__ == "__main__":
    # provide the indut/outpur directory paths
    input_dir = os.path.join(os.getcwd(), "images")
    output_dir = os.path.join(os.getcwd(), "output")

    for img_file in os.listdir(input_dir):
        img_file_path = os.path.join(input_dir, img_file)
        image, rescaled_image = read_image(img_path=img_file_path)
        img_out_dir = os.path.join(output_dir, img_file.split(".")[0])
        extract_text_lines(rescaled_image, img_out_dir)
        extract_handwriting_png(img_out_dir)
        # extract_text_chars(image, img_out_dir)
