import axios from 'axios';

// A plain, honest User-Agent: we say who we are and we read public pages only.
const USER_AGENT = 'Mozilla/5.0 (compatible; JobRadar/1.0; personal job search)';

const client = axios.create({
  timeout: 15_000, // a slow site must never hang a scan
  maxContentLength: 5 * 1024 * 1024,
  maxRedirects: 3,
  responseType: 'text',
  transformResponse: (data) => data, // keep raw text; each collector parses it itself
  headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
});

const bareHost = (host) => host.replace(/^www\./, '');

// GET a URL and return the body as text. Throws on network errors and on 4xx/5xx.
// A redirect is followed only inside the same site over https, so a feed can never send us
// to another (for example internal) address.
export async function httpGet(url, options = {}) {
  const originHost = bareHost(new URL(url).hostname);
  const response = await client.get(url, {
    ...options,
    beforeRedirect(redirect) {
      if (redirect.protocol !== 'https:' || bareHost(redirect.hostname) !== originHost) {
        throw new Error('Redirect to another site was blocked');
      }
    },
  });
  return response.data;
}
