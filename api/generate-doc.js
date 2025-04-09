// api/generate-doc.js

const fetch = require('node-fetch');

const openai_api_key = process.env.OPENAI_API_KEY;
const github_access_token = process.env.GITHUB_ACCESS_TOKEN; // From Vercel environment variables

// Sleep helper function to delay between retries
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Function that makes the OpenAI API call with retry logic
async function attemptOpenAICall(prompt, attempt = 1) {
  const maxAttempts = 3;
  try {
    const completion = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openai_api_key}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-2024-07-18',
        messages: [
          { role: 'system', content: 'You are a helpful assistant for generating code documentation.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7
      })
    });
  
    const data = await completion.json();
    if (completion.ok) {
      return data;
    } else {
      // Throw an error that will be caught and trigger a retry
      throw new Error("OpenAI API error: " + JSON.stringify(data));
    }
  } catch (error) {
    console.error(`Attempt ${attempt} failed: ${error.message}`);
    if (attempt < maxAttempts) {
      // Wait one second before retrying
      await sleep(1000);
      return attemptOpenAICall(prompt, attempt + 1);
    } else {
      throw error;
    }
  }
}

module.exports = async function (req, res) {
  // Optional: Allow CORS if needed
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Only POST requests allowed' });
    return;
  }

  let { code, jira, inputMethod, githubFileUrl } = req.body;

  // If inputMethod is 'githubFile', fetch code from GitHub
  if (inputMethod === 'githubFile') {
    try {
      code = await fetchCodeFromGitHubFile(githubFileUrl);
    } catch (error) {
      console.error('Error fetching code from GitHub:', error);
      res.status(500).json({ error: 'Failed to fetch code from GitHub.' });
      return;
    }
  }

  if (!code || typeof code !== 'string') {
    res.status(400).json({ error: 'No valid code provided.' });
    return;
  }

  // Enforce maximum code length (adjust as needed for token limits)
  const maxCodeLength = 150000;
  if (code.length > maxCodeLength) {
    res.status(400).json({ error: 'The selected code is too large to process. Please select a smaller file or code snippet.' });
    return;
  }

  const prompt = `
You are a developer tasked with generating comprehensive documentation for the following code snippet. Use the provided code and context to create clear Markdown documentation with a title, summary, and details about key components.

**Code Snippet:**
\`\`\`
${code}
\`\`\`

**Additional Context:**
${jira}

Generate the documentation below:
`;

  try {
    const data = await attemptOpenAICall(prompt);
    const documentation = data.choices[0].message.content.trim();
    res.status(200).json({ documentation });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error generating documentation', details: error.message });
  }
};

// Function to fetch code from a GitHub file URL
async function fetchCodeFromGitHubFile(fileUrl) {
  // Convert the GitHub URL to a raw file URL
  const rawUrl = fileUrl
    .replace('github.com', 'raw.githubusercontent.com')
    .replace('/blob/', '/');

  const headers = {};
  if (github_access_token) {
    headers['Authorization'] = `token ${github_access_token}`;
  }

  const response = await fetch(rawUrl, { headers });
  if (!response.ok) {
    throw new Error(`GitHub raw content error: ${response.statusText}`);
  }
  const code = await response.text();

  // Ensure file size is within limits (50KB)
  const fileSizeInBytes = Buffer.byteLength(code, 'utf8');
  const maxFileSize = 50 * 1024; // 50KB
  if (fileSizeInBytes > maxFileSize) {
    throw new Error('File size exceeds 50KB limit.');
  }

  return code;
}
