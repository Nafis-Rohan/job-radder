import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed } from '../weworkremotely.js';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss">
  <channel>
    <title>We Work Remotely: Back-End Programming Jobs</title>
    <item>
      <title>Acme: Senior Node.js Engineer</title>
      <region>Anywhere in the World</region>
      <country>Bangladesh</country>
      <description>&lt;p&gt;We need 5+ years of &lt;strong&gt;Node.js&lt;/strong&gt; and Docker.&lt;/p&gt;</description>
      <pubDate>Thu, 05 Nov 2026 17:12:27 +0000</pubDate>
      <expires_at>Sat, 05 Dec 2026 17:12:27 +0000</expires_at>
      <guid>https://weworkremotely.com/remote-jobs/acme-senior-node</guid>
      <link>https://weworkremotely.com/remote-jobs/acme-senior-node</link>
    </item>
    <item>
      <title>No company in this title</title>
      <region>USA Only</region>
      <description>Plain text</description>
      <guid>https://weworkremotely.com/remote-jobs/no-company</guid>
      <link>https://weworkremotely.com/remote-jobs/no-company</link>
    </item>
  </channel>
</rss>`;

test('turns feed items into normalized jobs', async () => {
  const [job] = await parseFeed(XML);
  assert.equal(job.source, 'weworkremotely');
  assert.equal(job.company, 'Acme');
  assert.equal(job.title, 'Senior Node.js Engineer');
  assert.equal(job.url, 'https://weworkremotely.com/remote-jobs/acme-senior-node');
  assert.equal(job.isRemote, true);
  assert.equal(job.remoteScope, 'Anywhere in the World');
  assert.equal(job.location, 'Bangladesh');
  assert.equal(job.description, 'We need 5+ years of Node.js and Docker.');
  assert.equal(job.postedAt.toISOString(), '2026-11-05T17:12:27.000Z');
  assert.equal(job.deadline.toISOString(), '2026-12-05T17:12:27.000Z');
});

test('uses the region as location when there is no country', async () => {
  const jobs = await parseFeed(XML);
  assert.equal(jobs[1].location, 'USA Only');
  assert.equal(jobs[1].remoteScope, 'USA Only');
});

test('a title without "Company: " gets the company "Unknown"', async () => {
  const jobs = await parseFeed(XML);
  assert.equal(jobs[1].company, 'Unknown');
  assert.equal(jobs[1].title, 'No company in this title');
});

test('an empty feed gives no jobs', async () => {
  const xml = '<?xml version="1.0"?><rss version="2.0"><channel><title>x</title></channel></rss>';
  assert.deepEqual(await parseFeed(xml), []);
});
