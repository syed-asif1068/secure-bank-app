package com.bank.service;

import com.bank.entity.Transaction;
import com.bank.entity.User;
import com.bank.repository.TransactionRepository;
import com.bank.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class BankService {

    private final UserRepository userRepository;
    private final TransactionRepository transactionRepository;

    public BankService(UserRepository userRepository,
                       TransactionRepository transactionRepository) {
        this.userRepository = userRepository;
        this.transactionRepository = transactionRepository;
    }

    public Map<String, Object> getUserProfile(String email) {
        User user = findUserByEmail(email);

        Map<String, Object> profile = new LinkedHashMap<>();
        profile.put("id", user.getId());
        profile.put("fullName", user.getFullName());
        profile.put("email", user.getEmail());
        profile.put("accountNumber", user.getAccountNumber());
        profile.put("balance", user.getBalance());
        profile.put("role", user.getRole());
        return profile;
    }

    @Transactional
    public BigDecimal transferMoney(String senderEmail,
                                    String receiverAccountNumber,
                                    BigDecimal amount) {
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new RuntimeException("Amount must be greater than zero");
        }
        if (receiverAccountNumber == null || receiverAccountNumber.isBlank()) {
            throw new RuntimeException("Receiver account number is required");
        }

        BigDecimal transferAmount = amount.setScale(2, RoundingMode.HALF_UP);
        if (transferAmount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new RuntimeException("Amount must be greater than zero");
        }

        User sender = findUserByEmail(senderEmail);
        User receiver = userRepository.findByAccountNumber(receiverAccountNumber.trim())
                .orElseThrow(() -> new RuntimeException("Receiver account not found"));

        if (sender.getAccountNumber().equals(receiver.getAccountNumber())) {
            throw new RuntimeException("Cannot transfer money to your own account");
        }

        if (sender.getBalance().compareTo(transferAmount) < 0) {
            throw new RuntimeException("Insufficient balance");
        }

        sender.setBalance(sender.getBalance().subtract(transferAmount));
        receiver.setBalance(receiver.getBalance().add(transferAmount));

        userRepository.save(sender);
        userRepository.save(receiver);

        Transaction transaction = new Transaction();
        transaction.setSenderAccount(sender.getAccountNumber());
        transaction.setReceiverAccount(receiver.getAccountNumber());
        transaction.setAmount(transferAmount);
        transaction.setTransactionType("TRANSFER");
        transaction.setStatus("SUCCESS");
        transaction.setTimestamp(LocalDateTime.now());
        transactionRepository.save(transaction);

        return sender.getBalance();
    }

    public List<Transaction> getTransactionHistory(String email) {
        User user = findUserByEmail(email);

        return transactionRepository.findBySenderAccountOrReceiverAccountOrderByTimestampDesc(
                user.getAccountNumber(),
                user.getAccountNumber());
    }

    private User findUserByEmail(String email) {
        if (email == null || email.isBlank()) {
            throw new RuntimeException("User not found");
        }

        return userRepository.findByEmail(email.trim())
                .orElseThrow(() -> new RuntimeException("User not found"));
    }
}
