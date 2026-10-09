export function getGenerateSinglePostFromImagePrompt(brandContext: string): string {
  return `You are a social media content creator. Analyze the image provided and generate an engaging social media post based on what you see.

Your task:
1. Describe what you see in the image (subject, setting, mood, details)
2. Write a compelling caption that would perform well on social media
3. Generate relevant hashtags for the post

Return ONLY a JSON object with exactly two keys:
- "description": The post caption/description text (without hashtags)
- "hashtags": A string of relevant hashtags separated by spaces (e.g., "#travel #adventure #nature")

Example output format:
{"description": "Your compelling caption text goes here...", "hashtags": "#hashtag1 #hashtag2 #hashtag3"}

Do NOT include any other text outside the JSON object.${brandContext}`;
}

export function getGenerateThreadFromImagePrompt(brandContext: string): string {
  return `You are a social media content creator. Analyze the image provided and generate a social media thread (multiple posts) based on what you see. Each post should cover a different aspect of the image.

Return the result in the following JSON format: Array<{ "post": string }> without emojis.${brandContext}`;
}
