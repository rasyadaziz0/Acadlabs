// Script to check if required Supabase tables exist
// Run with: node scripts/check-supabase-tables.js

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Create a Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Supabase URL and Anon Key must be set in .env file');
  console.log('Create a .env file with the following variables:');
  console.log('NEXT_PUBLIC_SUPABASE_URL=your-project-url');
  console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTables() {
  console.log('Checking Supabase tables...');
  
  try {
    // Check if profiles table exists
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id')
      .limit(1);
    
    if (profilesError) {
      if (profilesError.code === 'PGRST205') {
        console.error('❌ The profiles table does not exist!');
        console.log('Please run the SQL migration in supabase-migration.sql');
      } else {
        console.error('Error checking profiles table:', profilesError.message);
      }
    } else {
      console.log('✅ The profiles table exists');
    }
    
    // Check if chats table exists
    const { data: chatsData, error: chatsError } = await supabase
      .from('chats')
      .select('id')
      .limit(1);
    
    if (chatsError) {
      if (chatsError.code === 'PGRST205') {
        console.error('❌ The chats table does not exist!');
        console.log('Please run the SQL migration in supabase-migration.sql');
      } else {
        console.error('Error checking chats table:', chatsError.message);
      }
    } else {
      console.log('✅ The chats table exists');
    }
    
    // Check if messages table exists
    const { data: messagesData, error: messagesError } = await supabase
      .from('messages')
      .select('id')
      .limit(1);
    
    if (messagesError) {
      if (messagesError.code === 'PGRST205') {
        console.error('❌ The messages table does not exist!');
        console.log('Please run the SQL migration in supabase-migration.sql');
      } else {
        console.error('Error checking messages table:', messagesError.message);
      }
    } else {
      console.log('✅ The messages table exists');
    }
    
    console.log('\nIf any tables are missing, please run the SQL migration in supabase-migration.sql');
    console.log('See SUPABASE-SETUP.md for more information on setting up your database.');
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

checkTables();