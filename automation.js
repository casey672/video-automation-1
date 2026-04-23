async function runAutomation(job) {
  const { topic } = job;

  console.log("Processing:", topic);

  // STEP 1 - script (AI later)
  const script = `Video script about ${topic}`;

  // STEP 2 - caption
  const caption = `Learn about ${topic} in this breakdown`;

  // STEP 3 - placeholders for real integrations
  const videoUrl = "";

  return {
    script,
    caption,
    videoUrl
  };
}

module.exports = { runAutomation };