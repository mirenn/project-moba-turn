import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'antigravity_move.json');
    
    if (fs.existsSync(filePath)) {
      const moveData = fs.readFileSync(filePath, 'utf8');
      
      // Parse the JSON just to validate it
      const parsedMove = JSON.parse(moveData);
      
      // Attempt to delete the file after reading it
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        console.warn('Could not delete antigravity_move.json:', e);
      }
      
      return NextResponse.json({ status: 'success', data: parsedMove });
    } else {
      return NextResponse.json({ status: 'waiting' });
    }
  } catch (error) {
    console.error('Error reading game move:', error);
    return NextResponse.json({ status: 'error', error: 'Failed to read move' }, { status: 500 });
  }
}
