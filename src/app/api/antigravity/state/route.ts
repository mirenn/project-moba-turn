import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
  try {
    const gameState = await request.json();
    const filePath = path.join(process.cwd(), 'antigravity_state.json');
    
    fs.writeFileSync(filePath, JSON.stringify(gameState, null, 2), 'utf8');
    
    return NextResponse.json({ success: true, message: 'Game state saved to antigravity_state.json' });
  } catch (error) {
    console.error('Error saving game state:', error);
    return NextResponse.json({ success: false, error: 'Failed to save game state' }, { status: 500 });
  }
}
