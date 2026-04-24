require('dotenv').config();
const db = require('./db');

async function runCleanup() {
    console.log("🔍 Scanning for duplicate 'Unknown' contacts...");

    // 1. Fetch all contacts
    const { data: contacts, error } = await db.from('contacts').select('*');
    if (error) {
        console.error("Error fetching contacts:", error);
        process.exit(1);
    }

    const unformattedToId = {};
    const formattedContacts = [];
    const duplicatesToMerge = [];

    // Separate them into fully formatted and duplicates
    for (const c of contacts) {
        const clean = c.phone_number.replace(/[^\d+]/g, '');
        const last10 = clean.length >= 10 ? clean.slice(-10) : clean;
        
        if (c.name === 'Unknown' && c.phone_number.startsWith('+1')) {
            duplicatesToMerge.push({ ...c, last10 });
        } else {
            formattedContacts.push({ ...c, last10 });
        }
    }

    let mergedCount = 0;

    // 2. Try to merge duplicates into formatted contacts
    for (const dup of duplicatesToMerge) {
        const mainContact = formattedContacts.find(c => c.user_id === dup.user_id && c.last10 === dup.last10);
        
        if (mainContact) {
            console.log(`\n🔄 Merging Duplicate [ID: ${dup.id}, Phone: ${dup.phone_number}] into Main [ID: ${mainContact.id}, Phone: ${mainContact.phone_number}]`);
            
            // Move messages
            const { data: msgs } = await db.from('messages').update({ contact_id: mainContact.id }).eq('contact_id', dup.id).select('id');
            console.log(`   - Moved ${msgs ? msgs.length : 0} messages.`);
            
            // Update main contact last_message if needed
            if (dup.last_message && !mainContact.last_message) {
                await db.from('contacts').update({ last_message: dup.last_message, updated_at: dup.updated_at }).eq('id', mainContact.id);
                console.log(`   - Transferred last_message.`);
            }

            // Delete duplicate
            await db.from('contacts').delete().eq('id', dup.id);
            console.log(`   - Deleted duplicate contact row.`);
            mergedCount++;
        }
    }

    console.log(`\n✅ Cleanup complete! Merged ${mergedCount} duplicate contacts.`);
    process.exit(0);
}

runCleanup();
