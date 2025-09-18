import { NextRequest, NextResponse } from 'next/server';

// Konfigurasi untuk menangani permintaan dengan ukuran lebih besar
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

const JUDGE0_API_URL = 'https://judge0-ce.p.rapidapi.com/submissions';

export async function POST(request: NextRequest) {
  try {
    const { source_code, language_id } = await request.json();

    // Validasi input
    if (!source_code || !language_id) {
      return NextResponse.json(
        { error: 'Source code and language ID are required' },
        { status: 400 }
      );
    }

    // Kirim kode ke Judge0 API
    const response = await fetch(`${JUDGE0_API_URL}?base64_encoded=false&wait=true`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY || '',
        'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com',
      },
      body: JSON.stringify({
        source_code,
        language_id,
        stdin: '',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Judge0 API error:', errorText);
      return NextResponse.json(
        { error: `Judge0 API error: ${response.status}` },
        { status: response.status }
      );
    }

    const result = await response.json();

    return NextResponse.json({
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      status: result.status || {},
      compile_output: result.compile_output || '',
      message: result.message || '',
      time: result.time || '',
      memory: result.memory || '',
    });
  } catch (error) {
    console.error('Error in run-code API:', error);
    return NextResponse.json(
      { error: `Server error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}