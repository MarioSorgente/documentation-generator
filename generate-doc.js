const axios = require('axios');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { codeSnippet, jiraTicket } = req.body;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are an AI assistant that helps developers create clear and concise documentation for their code. Based on the provided code snippet and associated Jira ticket information, generate comprehensive documentation in Markdown format, optimized for seamless pasting into tools like Notion or Confluence."
        },
        {
          role: "user",
          content: `Code Snippet:\n${codeSnippet}\n\nJira Ticket:\n${jiraTicket}\n\nPlease generate documentation based on the above information.`
        }
      ]
    }, {
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      }
    });

    res.status(200).json({ documentation: response.data.choices[0].message.content });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate documentation' });
  }
};
