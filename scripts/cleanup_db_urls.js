import sequelize from '../src/config/db.js';

async function cleanupDatabaseUrls() {
  console.log('🔄 Starting database media URL cleanup...');

  // 1. messages.media_url
  const [msgRes] = await sequelize.query(`
    UPDATE messages 
    SET media_url = CASE
      WHEN media_url LIKE '%localhost:5000%' THEN REPLACE(REPLACE(media_url, 'https://localhost:5000', 'https://api.smartgali.com'), 'http://localhost:5000', 'https://api.smartgali.com')
      WHEN media_url LIKE '%127.0.0.1:5000%' THEN REPLACE(media_url, 'http://127.0.0.1:5000', 'https://api.smartgali.com')
      WHEN media_url LIKE '%192.168.31.15:5000%' THEN REPLACE(media_url, 'http://192.168.31.15:5000', 'https://api.smartgali.com')
      WHEN media_url LIKE '%localhost:5001%' THEN REPLACE(media_url, 'http://localhost:5001', 'https://api.smartgali.com')
      ELSE media_url
    END
    WHERE media_url LIKE '%localhost%' OR media_url LIKE '%127.0.0.1%' OR media_url LIKE '%192.168.%'
  `);
  console.log('✅ Updated messages.media_url:', msgRes);

  // 2. user_profiles.avatarUrl
  const [upRes] = await sequelize.query(`
    UPDATE user_profiles 
    SET avatarUrl = CASE
      WHEN avatarUrl LIKE '%localhost:5000%' THEN REPLACE(REPLACE(avatarUrl, 'https://localhost:5000', 'https://api.smartgali.com'), 'http://localhost:5000', 'https://api.smartgali.com')
      WHEN avatarUrl LIKE '%127.0.0.1:5000%' THEN REPLACE(avatarUrl, 'http://127.0.0.1:5000', 'https://api.smartgali.com')
      WHEN avatarUrl LIKE '%192.168.31.15:5000%' THEN REPLACE(avatarUrl, 'http://192.168.31.15:5000', 'https://api.smartgali.com')
      ELSE avatarUrl
    END
    WHERE avatarUrl LIKE '%localhost%' OR avatarUrl LIKE '%127.0.0.1%' OR avatarUrl LIKE '%192.168.%'
  `);
  console.log('✅ Updated user_profiles.avatarUrl:', upRes);

  // 3. communities.cover_image
  const [commRes] = await sequelize.query(`
    UPDATE communities 
    SET cover_image = CASE
      WHEN cover_image LIKE '%localhost%' THEN REPLACE(REPLACE(cover_image, 'https://localhost:5001', 'https://api.smartgali.com'), 'http://localhost:5001', 'https://api.smartgali.com')
      WHEN cover_image LIKE '%127.0.0.1%' THEN REPLACE(cover_image, 'http://127.0.0.1:5001', 'https://api.smartgali.com')
      WHEN cover_image LIKE '%192.168.%' THEN REPLACE(cover_image, 'http://192.168.31.15:5000', 'https://api.smartgali.com')
      ELSE cover_image
    END
    WHERE cover_image LIKE '%localhost%' OR cover_image LIKE '%127.0.0.1%' OR cover_image LIKE '%192.168.%'
  `);
  console.log('✅ Updated communities.cover_image:', commRes);

  // Verify
  const [remainingMsgs] = await sequelize.query(
    "SELECT COUNT(*) as cnt FROM messages WHERE media_url LIKE '%localhost%' OR media_url LIKE '%127.0.0.1%' OR media_url LIKE '%192.168.%'"
  );
  const [remainingAvatars] = await sequelize.query(
    "SELECT COUNT(*) as cnt FROM user_profiles WHERE avatarUrl LIKE '%localhost%' OR avatarUrl LIKE '%127.0.0.1%' OR avatarUrl LIKE '%192.168.%'"
  );
  const [remainingComms] = await sequelize.query(
    "SELECT COUNT(*) as cnt FROM communities WHERE cover_image LIKE '%localhost%' OR cover_image LIKE '%127.0.0.1%' OR cover_image LIKE '%192.168.%'"
  );

  console.log(`Remaining local URLs: messages: ${remainingMsgs[0].cnt}, avatars: ${remainingAvatars[0].cnt}, communities: ${remainingComms[0].cnt}`);

  // Show recent cleaned messages
  const [sampleMsgs] = await sequelize.query(
    "SELECT id, message_type, media_url FROM messages WHERE media_url IS NOT NULL ORDER BY id DESC LIMIT 5"
  );
  console.log('Recent messages now:', sampleMsgs);

  process.exit(0);
}

cleanupDatabaseUrls().catch(err => {
  console.error('Error during cleanup:', err);
  process.exit(1);
});
