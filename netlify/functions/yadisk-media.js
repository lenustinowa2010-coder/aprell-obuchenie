const API = 'https://cloud-api.yandex.net/v1/disk/public/resources';
const PUBLIC_URL = 'https://disk.yandex.ru/d/f0I39Hv9-mUcwQ';

exports.handler = async event => {
  const mediaPath = event.queryStringParameters?.path;
  const download = event.queryStringParameters?.download === '1';
  if (!mediaPath || !mediaPath.startsWith('/')) {
    return { statusCode: 400, body: 'Missing media path' };
  }

  const url = new URL(download ? `${API}/download` : API);
  url.searchParams.set('public_key', PUBLIC_URL);
  url.searchParams.set('path', mediaPath);
  if (!download) url.searchParams.set('preview_size', 'XXXL');

  try {
    const response = await fetch(url);
    if (!response.ok) return { statusCode: response.status, body: 'Media unavailable' };
    const data = await response.json();
    // Preview is a browser-friendly JPEG even when the original is HEIC.
    const target = download ? data.href : (data.preview || data.file);
    if (!target) return { statusCode: 404, body: 'Media unavailable' };
    return {
      statusCode: 302,
      headers: {
        Location: target,
        'Cache-Control': 'public, max-age=300, s-maxage=300'
      },
      body: ''
    };
  } catch (error) {
    return { statusCode: 502, body: 'Yandex Disk is temporarily unavailable' };
  }
};
