import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlToText } from '../htmlToText.js';

test('removes tags and keeps paragraphs on separate lines', () => {
  assert.equal(htmlToText('<p>Hello <strong>world</strong></p><p>Second</p>'), 'Hello world\nSecond');
});

test('turns list items into dashes', () => {
  assert.equal(htmlToText('<ul><li>Node.js</li><li>Docker</li></ul>'), '- Node.js\n- Docker');
});

test('decodes entities', () => {
  assert.equal(htmlToText('R&amp;D &lt;team&gt; &quot;hi&quot; &#39;x&#39; a&nbsp;b'), 'R&D <team> "hi" \'x\' a b');
});

test('decodes common punctuation entities', () => {
  assert.equal(htmlToText('Dev &mdash; remote &rsquo;s &hellip;'), "Dev - remote 's ...");
});

test('a number outside the Unicode range does not crash', () => {
  assert.equal(htmlToText('a&#99999999;b&#x110000;c'), 'abc');
});

test('drops script and style content', () => {
  assert.equal(htmlToText('<style>p{color:red}</style>Text<script>alert(1)</script>'), 'Text');
});

test('handles empty input', () => {
  assert.equal(htmlToText(''), '');
  assert.equal(htmlToText(null), '');
});
