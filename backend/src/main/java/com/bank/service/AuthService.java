package com.bank.service;

import com.bank.entity.User;
import com.bank.repository.UserRepository;
import com.bank.security.JwtUtil;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

@Service
public class AuthService {

    private static final BigDecimal INITIAL_BALANCE = new BigDecimal("5000.00");
    private static final String ACCOUNT_PREFIX = "SB";
    private static final int ACCOUNT_NUMBER_BOUND = 100_000_000;
    private static final int MAX_ACCOUNT_GENERATION_ATTEMPTS = 100;

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final SecureRandom secureRandom = new SecureRandom();

    public AuthService(UserRepository userRepository,
                       PasswordEncoder passwordEncoder,
                       JwtUtil jwtUtil) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
    }

    public Map<String, Object> register(String fullName, String email, String password) {
        if (fullName == null || fullName.isBlank()) {
            throw new RuntimeException("Full name is required");
        }
        if (email == null || email.isBlank()) {
            throw new RuntimeException("Email is required");
        }
        if (password == null || password.isBlank()) {
            throw new RuntimeException("Password is required");
        }

        String normalizedEmail = email.trim().toLowerCase(Locale.ROOT);

        if (userRepository.existsByEmail(normalizedEmail)) {
            throw new RuntimeException("Email already registered");
        }

        User user = new User();
        user.setFullName(fullName.trim());
        user.setEmail(normalizedEmail);
        user.setPassword(passwordEncoder.encode(password));
        user.setAccountNumber(generateUniqueAccountNumber());
        user.setBalance(INITIAL_BALANCE);
        user.setRole("CUSTOMER");
        user.setCreatedAt(LocalDateTime.now());

        User savedUser = userRepository.save(user);
        return buildAuthResponse(savedUser);
    }

    public Map<String, Object> login(String email, String password) {
        if (email == null || email.isBlank() || password == null || password.isBlank()) {
            throw new RuntimeException("Invalid email or password");
        }

        String normalizedEmail = email.trim().toLowerCase(Locale.ROOT);

        User user = userRepository.findByEmail(normalizedEmail)
                .orElseThrow(() -> new RuntimeException("Invalid email or password"));

        if (!passwordEncoder.matches(password, user.getPassword())) {
            throw new RuntimeException("Invalid email or password");
        }

        return buildAuthResponse(user);
    }

    private Map<String, Object> buildAuthResponse(User user) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("token", jwtUtil.generateToken(user.getEmail()));
        response.put("fullName", user.getFullName());
        response.put("email", user.getEmail());
        response.put("accountNumber", user.getAccountNumber());
        response.put("balance", user.getBalance());
        return response;
    }

    private String generateUniqueAccountNumber() {
        for (int attempt = 0; attempt < MAX_ACCOUNT_GENERATION_ATTEMPTS; attempt++) {
            int randomDigits = secureRandom.nextInt(ACCOUNT_NUMBER_BOUND);
            String accountNumber = ACCOUNT_PREFIX + String.format(Locale.ROOT, "%08d", randomDigits);

            if (userRepository.findByAccountNumber(accountNumber).isEmpty()) {
                return accountNumber;
            }
        }

        throw new RuntimeException("Unable to generate a unique account number");
    }
}
