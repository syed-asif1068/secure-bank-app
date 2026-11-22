package com.bank.controller;

import com.bank.entity.Transaction;
import com.bank.service.BankService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/bank")
public class BankController {

    private final BankService bankService;

    public BankController(BankService bankService) {
        this.bankService = bankService;
    }

    @GetMapping("/profile")
    public ResponseEntity<?> getProfile(Authentication authentication) {
        try {
            if (authentication == null) {
                return unauthorized();
            }
            return ResponseEntity.ok(bankService.getUserProfile(authentication.getName()));
        } catch (RuntimeException ex) {
            return badRequest(ex);
        }
    }

    @PostMapping("/transfer")
    public ResponseEntity<?> transfer(@RequestBody(required = false) Map<String, Object> request,
                                      Authentication authentication) {
        try {
            if (authentication == null) {
                return unauthorized();
            }

            Map<String, Object> body = request == null ? Map.of() : request;
            String receiverAccountNumber = stringValue(body, "receiverAccountNumber");
            BigDecimal amount = parseAmount(body.get("amount"));

            BigDecimal updatedBalance = bankService.transferMoney(
                    authentication.getName(), receiverAccountNumber, amount);

            Map<String, Object> response = new LinkedHashMap<>();
            response.put("message", "Transfer successful");
            response.put("balance", updatedBalance);
            return ResponseEntity.ok(response);
        } catch (RuntimeException ex) {
            return badRequest(ex);
        }
    }

    @GetMapping("/transactions")
    public ResponseEntity<?> getTransactions(Authentication authentication) {
        try {
            if (authentication == null) {
                return unauthorized();
            }

            List<Transaction> transactions = bankService.getTransactionHistory(authentication.getName());
            return ResponseEntity.ok(transactions);
        } catch (RuntimeException ex) {
            return badRequest(ex);
        }
    }

    private String stringValue(Map<String, Object> body, String key) {
        Object value = body.get(key);
        return value == null ? null : value.toString();
    }

    private BigDecimal parseAmount(Object value) {
        if (value == null || value.toString().isBlank()) {
            throw new RuntimeException("Amount is required");
        }
        if (value instanceof BigDecimal decimal) {
            return decimal;
        }
        if (value instanceof Number number) {
            return new BigDecimal(number.toString());
        }

        try {
            return new BigDecimal(value.toString().trim());
        } catch (NumberFormatException ex) {
            throw new RuntimeException("Invalid amount");
        }
    }

    private ResponseEntity<Map<String, String>> badRequest(RuntimeException ex) {
        Map<String, String> body = new LinkedHashMap<>();
        body.put("error", ex.getMessage() != null ? ex.getMessage() : "Request failed");
        return ResponseEntity.badRequest().body(body);
    }

    private ResponseEntity<Map<String, String>> unauthorized() {
        Map<String, String> body = new LinkedHashMap<>();
        body.put("error", "Unauthorized");
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(body);
    }
}
