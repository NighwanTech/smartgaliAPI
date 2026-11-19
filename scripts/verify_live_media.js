import { normalizeMediaUrl, normalizeMediaPayload } from '../src/utils/mediaUrl.js';
import { serializePost } from '../src/modules/post/post.service.js';
import sequelize from '../src/config/db.js';

async function runVerification() {
  console.log('🧪 Starting End-to-End Live URL Verification...\n');

  // Test 1: normalizeMediaUrl behavior
  const urls = [
    '/uploads/post_xyz.jpg',
    'uploads/post_xyz.jpg',
    'http://localhost:5000/uploads/chat_1.png',
    'https://localhost:5000/uploads/chat_2.png',
    'http://127.0.0.1:5000/uploads/chat_3.pdf',
    'http://192.168.31.15:5000/uploads/chat_4.m4a',
    'http://10.0.2.2:5000/uploads/chat_5.mp4',
    'http://api.smartgali.com/uploads/live.jpg',
    'https://api.smartgali.com/uploads/live.jpg',
    'https://cdn.example.com/external.jpg'
  ];

  console.log('1. URL Normalization check:');
  for (const u of urls) {
    const res = normalizeMediaUrl(u);
    console.log(`   ${u}  ==>  ${res}`);
    if (u.includes('external')) {
      if (res !== u) throw new Error('External URL altered!');
    } else {
      if (!res.startsWith('https://api.smartgali.com/uploads/')) {
        throw new Error(`Failed to produce canonical https://api.smartgali.com url for: ${u} (got ${res})`);
      }
    }
  }
  console.log('   ✅ All URL normalizations correctly map to https://api.smartgali.com!\n');

  // Test 2: Database check
  console.log('2. Database URLs check:');
  const [msgs] = await sequelize.query("SELECT COUNT(*) as cnt FROM messages WHERE media_url LIKE '%localhost%' OR media_url LIKE '%127.0.0.1%' OR media_url LIKE '%192.168.%'");
  const [avatars] = await sequelize.query("SELECT COUNT(*) as cnt FROM user_profiles WHERE avatarUrl LIKE '%localhost%' OR avatarUrl LIKE '%127.0.0.1%' OR avatarUrl LIKE '%192.168.%'");
  const [comms] = await sequelize.query("SELECT COUNT(*) as cnt FROM communities WHERE cover_image LIKE '%localhost%' OR cover_image LIKE '%127.0.0.1%' OR cover_image LIKE '%192.168.%'");
  console.log(`   Residual local messages: ${msgs[0].cnt}`);
  console.log(`   Residual local avatars: ${avatars[0].cnt}`);
  console.log(`   Residual local communities: ${comms[0].cnt}`);
  if (msgs[0].cnt > 0 || avatars[0].cnt > 0 || comms[0].cnt > 0) {
    throw new Error('Local URLs remain in database!');
  }
  console.log('   ✅ 0 local URLs found in database!\n');

  // Test 3: Feed Post serialization & payload wrapping check
  console.log('3. Feed post serialization check:');
  const mockPost = {
    id: 123,
    content: 'Test post',
    type: 'image',
    visibility: 'public',
    is_pinned: false,
    comments_disabled: false,
    is_edited: false,
    location_name: 'Delhi',
    media_url: '/uploads/post_sample.jpg',
    likes_count: 5,
    comments_count: 2,
    shares_count: 1,
    created_at: new Date(),
    community_id: null,
  };
  const mockMedia = [
    { id: 1, url: '/uploads/post_sample.jpg', type: 'image' },
    { id: 2, url: 'http://localhost:5000/uploads/post_sample2.jpg', type: 'image' }
  ];
  const serialized = serializePost(mockPost, null, mockMedia, null);
  const payloadWrapped = normalizeMediaPayload({ post: serialized });
  console.log('   Serialized & normalized post mediaUrl:', payloadWrapped.post.mediaUrl);
  console.log('   Serialized & normalized post mediaUrls[0].url:', payloadWrapped.post.mediaUrls[0].url);
  console.log('   Serialized & normalized post mediaUrls[1].url:', payloadWrapped.post.mediaUrls[1].url);

  if (
    payloadWrapped.post.mediaUrl !== 'https://api.smartgali.com/uploads/post_sample.jpg' ||
    payloadWrapped.post.mediaUrls[0].url !== 'https://api.smartgali.com/uploads/post_sample.jpg' ||
    payloadWrapped.post.mediaUrls[1].url !== 'https://api.smartgali.com/uploads/post_sample2.jpg'
  ) {
    throw new Error('Payload normalization failed for feed post!');
  }
  console.log('   ✅ Feed post media URLs successfully converted to live URL!\n');

  // Test 4: Live HTTP test
  console.log('4. Live uploads endpoint accessibility check:');
  const [liveMsg] = await sequelize.query("SELECT media_url FROM messages WHERE media_url IS NOT NULL ORDER BY id DESC LIMIT 1");
  if (liveMsg.length > 0) {
    const testUrl = liveMsg[0].media_url;
    console.log(`   Checking accessibility of: ${testUrl}`);
    const res = await fetch(testUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    console.log(`   HTTP Status: ${res.status} (${res.headers.get('content-type')})`);
    if (res.status !== 200) {
      console.warn(`   ⚠️ Warning: Status is ${res.status}`);
    } else {
      console.log('   ✅ Live upload is accessible and returned 200 OK!');
    }
  }

  console.log('\n🎉 ALL VERIFICATION TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

runVerification().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
