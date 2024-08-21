export async function kana2en(text: string) {
  const url = `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&dt=t&dt=rm&dj=1&sl=ja&tl=en&q=${encodeURI(text)}`;
  // console.log(`logmm Request URL: ${url}`);
  // console.log(`logmm Request Method: GET`);
  // console.log(`logmm Request Body: ${text}`);

  const response = await fetch(url);
  // console.log(`logmm Response Status: ${response.status} ${response.statusText}`);
  // console.log(`logmm Response Headers: ${JSON.stringify(response.headers)}`);

  if (!response.ok) {
    return "";
  }

  const data = (await response.json()) as { sentences: { trans: string }[] };
  // console.log(`logmm Response Data: ${JSON.stringify(data)}`);
  return data.sentences?.[0]?.trans ?? "";
}
