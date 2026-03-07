<?php
/**
 * Contact Form Handler with Resend
 * 
 * Features:
 * - Rate limiting (3 requests / 5 min per IP)
 * - Input validation
 * - Honeypot spam protection
 * - HTML email template
 * - Error handling
 * 
 * Usage: POST JSON to this endpoint
 * {
 *   "name": "John Doe",
 *   "email": "john@example.com",
 *   "company": "Acme Inc",        // optional
 *   "message": "Hello...",        // optional
 *   "interests": ["Option 1"],    // optional array
 *   "website": ""                 // honeypot - must be empty
 * }
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle CORS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Only allow POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// --- Configuration ---
$config = [
    'resend_api_key' => getenv('RESEND_API_KEY') ?: 'your_api_key_here',
    'from_email' => 'Your App <noreply@yourdomain.com>',
    'to_email' => 'you@yourdomain.com',
    'rate_limit_requests' => 3,
    'rate_limit_window' => 300, // 5 minutes
    'valid_interests' => ['Option 1', 'Option 2', 'Option 3'],
];

// --- Rate Limiting ---
$rateLimitDir = sys_get_temp_dir() . '/contact_ratelimit';
if (!is_dir($rateLimitDir)) {
    @mkdir($rateLimitDir, 0755, true);
}

$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$rateLimitFile = $rateLimitDir . '/' . md5($ip);
$now = time();

if (file_exists($rateLimitFile)) {
    $data = json_decode(file_get_contents($rateLimitFile), true);
    $data = array_values(array_filter($data, fn($ts) => $ts > $now - $config['rate_limit_window']));
    
    if (count($data) >= $config['rate_limit_requests']) {
        http_response_code(429);
        echo json_encode(['error' => 'Too many requests. Please try again in a few minutes.']);
        exit;
    }
    
    $data[] = $now;
    file_put_contents($rateLimitFile, json_encode($data));
} else {
    file_put_contents($rateLimitFile, json_encode([$now]));
}

// --- Parse Input ---
$input = json_decode(file_get_contents('php://input'), true);
if (!$input) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid request body']);
    exit;
}

// --- Validate ---
$name = trim($input['name'] ?? '');
$email = trim($input['email'] ?? '');
$company = trim($input['company'] ?? '');
$interests = $input['interests'] ?? [];
$message = trim($input['message'] ?? '');

if ($name === '' || strlen($name) > 200) {
    http_response_code(400);
    echo json_encode(['error' => 'Name is required']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 320) {
    http_response_code(400);
    echo json_encode(['error' => 'A valid email is required']);
    exit;
}

if (strlen($company) > 200) {
    http_response_code(400);
    echo json_encode(['error' => 'Company name too long']);
    exit;
}

if (strlen($message) > 5000) {
    http_response_code(400);
    echo json_encode(['error' => 'Message too long']);
    exit;
}

// Filter interests to valid options
if (!is_array($interests)) {
    $interests = [];
}
$interests = array_values(array_filter($interests, fn($i) => in_array($i, $config['valid_interests'])));

// Honeypot check
if (!empty($input['website'])) {
    // Bot detected - pretend success
    echo json_encode(['ok' => true]);
    exit;
}

// --- Build Email HTML ---
$safeName = htmlspecialchars($name);
$safeEmail = htmlspecialchars($email);
$safeCompany = htmlspecialchars($company);
$safeMessage = htmlspecialchars($message);

$interestsHtml = '';
if (!empty($interests)) {
    $tags = array_map(fn($i) => 
        '<span style="display:inline-block;background:#f0f4ff;color:#4f46e5;padding:4px 12px;border-radius:20px;font-size:13px;margin:2px 4px 2px 0;">' 
        . htmlspecialchars($i) . '</span>', 
        $interests
    );
    $interestsHtml = '<tr><td style="padding:12px 0;border-bottom:1px solid #f0f0f0;">'
        . '<strong style="color:#374151;">Interested in</strong><br>'
        . '<div style="margin-top:8px;">' . implode('', $tags) . '</div>'
        . '</td></tr>';
}

$companyRow = $company !== '' 
    ? '<tr><td style="padding:12px 0;border-bottom:1px solid #f0f0f0;"><strong style="color:#374151;">Company</strong><br><span style="color:#6b7280;">' . $safeCompany . '</span></td></tr>' 
    : '';

$messageRow = $message !== '' 
    ? '<tr><td style="padding:12px 0;border-bottom:1px solid #f0f0f0;"><strong style="color:#374151;">Message</strong><br><div style="color:#6b7280;margin-top:4px;white-space:pre-wrap;">' . $safeMessage . '</div></td></tr>' 
    : '';

$html = '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 0;">'
    . '<div style="background:#4f46e5;padding:24px 32px;border-radius:12px 12px 0 0;">'
    . '<h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">New contact form submission</h1>'
    . '</div>'
    . '<div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:24px 32px;">'
    . '<table style="width:100%;border-collapse:collapse;">'
    . '<tr><td style="padding:12px 0;border-bottom:1px solid #f0f0f0;"><strong style="color:#374151;">Name</strong><br><span style="color:#6b7280;">' . $safeName . '</span></td></tr>'
    . '<tr><td style="padding:12px 0;border-bottom:1px solid #f0f0f0;"><strong style="color:#374151;">Email</strong><br><a href="mailto:' . $safeEmail . '" style="color:#4f46e5;text-decoration:none;">' . $safeEmail . '</a></td></tr>'
    . $companyRow . $interestsHtml . $messageRow
    . '</table>'
    . '<div style="margin-top:24px;padding:16px;background:#f9fafb;border-radius:8px;">'
    . '<p style="margin:0;font-size:12px;color:#9ca3af;">IP: ' . htmlspecialchars($ip) . '</p>'
    . '</div></div></div>';

// --- Send via Resend ---
$payload = json_encode([
    'from' => $config['from_email'],
    'to' => [$config['to_email']],
    'reply_to' => $email,
    'subject' => 'New inquiry from ' . $name . ($company ? " ($company)" : ''),
    'html' => $html,
]);

$ch = curl_init('https://api.resend.com/emails');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $config['resend_api_key'],
        'Content-Type: application/json'
    ],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 10,
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($curlError) {
    error_log("Contact form - cURL error: $curlError");
    http_response_code(500);
    echo json_encode(['error' => 'Failed to send. Please try again.']);
    exit;
}

if ($httpCode >= 200 && $httpCode < 300) {
    echo json_encode(['ok' => true]);
} else {
    error_log("Contact form - Resend error ($httpCode): $response");
    http_response_code(502);
    echo json_encode(['error' => 'Failed to send. Please try again.']);
}
