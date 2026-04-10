<?php
header('Content-Type: application/json');

$file = 'bookings.json';

// Initialize file if not exists
if (!file_exists($file)) {
    file_put_contents($file, json_encode([]));
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    if (!file_exists($file)) {
        echo json_encode([]);
    } else {
        echo file_get_contents($file);
    }
} elseif ($method === 'POST') {
    $input = file_get_contents('php://input');
    if (json_decode($input) !== null) {
        if (file_put_contents($file, $input) === false) {
            http_response_code(500);
            echo json_encode(['error' => 'Datei konnte nicht geschrieben werden. Bitte prüfen Sie die Schreibrechte (CHMOD 755 oder 777) für den Ordner "pool".']);
        } else {
            echo json_encode(['success' => true]);
        }
    } else {
        http_response_code(400);
        echo json_encode(['error' => 'Ungültiges JSON-Format']);
    }
}
?>
