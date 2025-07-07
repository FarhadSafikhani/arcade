import fs from 'fs';
import path from 'path';

// Path to the version file
const versionFilePath = path.join(process.cwd(), 'src', 'version.ts');

try {
    // Read the current version file
    const versionContent = fs.readFileSync(versionFilePath, 'utf8');
    
    // Extract the current version using regex
    const versionMatch = versionContent.match(/export const VERSION = "(\d+)\.(\d+)\.(\d+)"/);
    
    if (!versionMatch) {
        throw new Error('Could not parse version from version.ts');
    }
    
    const [, major, minor, patch] = versionMatch;
    const newPatch = parseInt(patch) + 1;
    const newVersion = `${major}.${minor}.${newPatch}`;
    
    // Update the version file
    const newContent = `export const VERSION = "${newVersion}";`;
    fs.writeFileSync(versionFilePath, newContent);
    
    console.log(`✅ Version incremented: ${major}.${minor}.${patch} → ${newVersion}`);
    
} catch (error) {
    console.error('❌ Failed to increment version:', error.message);
    process.exit(1);
} 