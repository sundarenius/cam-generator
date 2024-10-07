import NodeWebcam from 'node-webcam';
import fs from 'fs';
import path from 'path';
import { Jimp } from 'jimp';

// Webcam options
const webcamOptions = {
  width: 640,
  height: 480,
  quality: 100,
  delay: 0,
  saveShots: true,
  output: 'jpeg',
  device: false,
  callbackReturn: 'location',  // Capture function returns the saved file path
  verbose: true  // Enable verbose logs for debugging
};

const webcam = NodeWebcam.create(webcamOptions);

// Function to take an image and ensure it's saved in the correct path
function captureImage(fullPath) {
  return new Promise((resolve, reject) => {
    console.log(`Capturing image: ${fullPath}`);
    
    // Capture the image using NodeWebcam
    webcam.capture(fullPath, (err, data) => {
      if (err) {
        console.error("Error capturing image:", err);
        reject(err);
      } else {
        console.log(`Image successfully saved: ${fullPath}`);
        resolve(data);  // Resolve with data returned by NodeWebcam (usually the filename)
      }
    });
  });
}

// Function to compare two images and detect motion
async function compareImages(image1Path, image2Path) {
  const img1 = await Jimp.read(image1Path);
  const img2 = await Jimp.read(image2Path);

  const diff = Jimp.diff(img1, img2);
  
  // Return true if the difference percentage is above a certain threshold
  return diff.percent > 0.15; // Adjust sensitivity as needed
}

// Function to ensure the directory exists and save the image to the folder
async function saveImageToFolder(imageName, folderPath) {
  // Ensure the folder exists; if not, create it
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
    console.log(`Folder created: ${folderPath}`);
  }

  // Full path to the image
  const fullPath = path.join(folderPath, imageName);
  console.log(`Full path for image: ${fullPath}`);

  try {
    // Capture and save the image in the specified folder
    await captureImage(fullPath);
    return fullPath;
  } catch (error) {
    console.error(`Error saving image to folder: ${error}`);
    throw error;
  }
}

// Function to continuously capture and save images only when motion is detected
async function monitorMotion() {
  console.log("Starting motion detection...");

  let imageCounter = 1;  // For unique image names
  const folderPath = './saved_images';  // Folder where images will be saved

  // Temporary storage for the previous image path
  const previousImagePath = path.join(folderPath, `previous_image.jpg`);

  // Capture the initial image to set as the previous image
  await saveImageToFolder('previous_image.jpg', folderPath);

  // Continuously check for motion
  setInterval(async () => {
    const currentImagePath = path.join(folderPath, `current_image.jpg`);
    
    // Capture the current image
    await captureImage(currentImagePath);
    
    // Check if the previous image exists before comparing
    if (fs.existsSync(previousImagePath)) {
      const motionDetected = await compareImages(previousImagePath, currentImagePath);
      
      if (motionDetected) {
        const filename = `image_${imageCounter}.jpg`;  // Unique image name for the detected motion
        await saveImageToFolder(filename, folderPath);
        console.log(`Motion detected! Saved image: ${filename}`);
        imageCounter++;  // Increment counter for next image
      }
    } else {
      console.warn(`Previous image does not exist, skipping comparison.`);
    }

    // Update the previous image path for the next comparison
    await saveImageToFolder('previous_image.jpg', folderPath); // Update the previous image after the comparison

  }, 1000);  // Adjust interval (1 second) as needed
}

// Start monitoring motion
monitorMotion().catch(err => {
  console.error("Error starting motion detection:", err);
});

// Keep the Node.js process alive
process.stdin.resume();
