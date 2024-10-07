import NodeWebcam from 'node-webcam';
import fs from 'fs';
import path from 'path';
import Jimp from 'jimp';
import AWS from 'aws-sdk';
import readline from 'readline';

// Configure AWS SDK
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID, // Your AWS access key
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY, // Your AWS secret access key
  region: process.env.AWS_REGION // Your AWS region
});

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
  verbose: false  // Disable verbose logs for cleaner output
};

const webcam = NodeWebcam.create(webcamOptions);

// Function to take an image and ensure it's saved in the correct path
function captureImage(fullPath) {
  return new Promise((resolve, reject) => {
    webcam.capture(fullPath, (err, data) => {
      if (err) {
        console.error("Error capturing image:", err);
        reject(err);
      } else {
        resolve(data);  // Resolve with data returned by NodeWebcam (usually the filename)
      }
    });
  });
}

// Function to compare two images and detect motion
async function compareImages(image1Path, image2Path) {
  const img1 = await Jimp.read(image1Path);
  const img2 = await Jimp.read(image2Path);

  // Convert images to grayscale for better comparison
  img1.grayscale();
  img2.grayscale();

  const diff = Jimp.diff(img1, img2);

  // Return true if the difference percentage is above a certain threshold
  const sensitivityThreshold = 0; // Adjust sensitivity as needed (10% difference)
  const diffPercent = diff.percent.toFixed(2);

  if (diffPercent > 0) {
    console.log(`Difference percentage: ${diff.percent.toFixed(2)}%`); // Log percentage for debugging
  }

  const isMotion = Math.ceil(Number(diffPercent)) > sensitivityThreshold; // Trigger motion if the difference exceeds the threshold
  return isMotion;
}

function generateDayMonthYear() {
  const date = new Date(); // Get the current date

  const options = { day: '2-digit', month: 'long', year: 'numeric' };
  const formattedDate = date.toLocaleDateString('en-US', options)
    .replace(/, /g, '') // Remove the comma and space
    .replace(/ /g, ''); // Remove spaces between day, month, and year

  return formattedDate; // e.g., "07October2024"
}

// Function to upload image to S3
async function uploadImageToS3(filePath, key) {
  const fileContent = fs.readFileSync(filePath);

  const dateStr = generateDayMonthYear();
  
  const params = {
    Bucket: 'sundstrom-debug-files',
    Key: `anka-security/${dateStr}/${key}`,
    Body: fileContent,
    ContentType: 'image/jpeg', // Change as needed for your image type
  };

  try {
    // Attempt to upload the image to S3
    const data = await s3.upload(params).promise();
    console.log(`File uploaded successfully. ${data.Location}`); // Log the file location after successful upload
  } catch (error) {
    console.error(`Error uploading file to S3: ${error.message}`); // Log error message
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
        console.log(`Motion detected! Saving image: ${filename} and uploaded to S3`);
        const savedImagePath = await saveImageToFolder(filename, folderPath);

        // Upload the image to S3
        try {
          await uploadImageToS3(savedImagePath, filename);
        } catch (error) {
          console.error(`Error uploading image to S3: ${error}`);
        }

        imageCounter++;  // Increment counter for next image

        // Update the previous image with the current one
        fs.copyFileSync(currentImagePath, previousImagePath);
      } else {
        // console.log(`No significant motion detected.`);
      }
    } else {
      console.warn(`Previous image does not exist, skipping comparison.`);
    }

  }, 1000);  // Adjust interval (1 second) as needed
}

// Function to ensure the directory exists and save the image to the folder
async function saveImageToFolder(imageName, folderPath) {
  // Ensure the folder exists; if not, create it
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  // Full path to the image
  const fullPath = path.join(folderPath, imageName);

  try {
    // Capture and save the image in the specified folder
    await captureImage(fullPath);
    return fullPath;
  } catch (error) {
    console.error(`Error saving image to folder: ${error}`);
    throw error;
  }
}

setTimeout(() => {
  // Start monitoring motion after 1 minute
  monitorMotion().catch(err => {
    console.error("Error starting motion detection:", err);
  });
}, 60000);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log("Press Enter to stop the process...");
// Listen for the 'line' event which is triggered when the user presses Enter
rl.on('line', () => {
    console.log("Stopping the process...");
    rl.close(); // Close the readline interface
    process.exit(0); // Exit the process with a success code
});

// Keep the Node.js process alive
process.stdin.resume();
