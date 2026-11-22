package com.bank.controller;

import com.bank.service.AuthService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody(required = false) Map<String, Object> request) {
        try {
            Map<String, Object> body = request == null ? Map.of() : request;
            Map<String, Object> response = authService.register(
                    stringValue(body, "fullName"),
                    stringValue(body, "email"),
                    stringValue(body, "password"));
            return ResponseEntity.ok(response);
        } catch (RuntimeException ex) {
            return badRequest(ex);
        }
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody(required = false) Map<String, Object> request) {
        try {
            Map<String, Object> body = request == null ? Map.of() : request;
            Map<String, Object> response = authService.login(
                    stringValue(body, "email"),
                    stringValue(body, "password"));
            return ResponseEntity.ok(response);
        } catch (RuntimeException ex) {
            return badRequest(ex);
        }
    }

    private String stringValue(Map<String, Object> body, String key) {
        Object value = body.get(key);
        return value == null ? null : value.toString();
    }

    private ResponseEntity<Map<String, String>> badRequest(RuntimeException ex) {
        Map<String, String> body = new LinkedHashMap<>();
        body.put("error", ex.getMessage() != null ? ex.getMessage() : "Request failed");
        return ResponseEntity.badRequest().body(body);
    }
}
