import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { radius, spacing, typography } from '../theme';

// Ported from GymMate src/components/Input.js (shared design kit).
export default function Input({ label, value, onChangeText, placeholder, keyboardType, style, multiline, ...rest }) {
  const { theme } = useTheme();
  return (
    <View style={style}>
      {label && (
        <Text style={[styles.label, { color: theme.textSecondary, fontSize: typography.sizes.sm }]}>
          {label}
        </Text>
      )}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        keyboardType={keyboardType}
        multiline={multiline}
        style={[
          styles.input,
          {
            backgroundColor: theme.input,
            borderColor: theme.border,
            color: theme.text,
            textAlignVertical: multiline ? 'top' : 'center',
            minHeight: multiline ? 80 : undefined,
          },
        ]}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    marginBottom: spacing[1],
    fontWeight: '500',
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    fontSize: typography.sizes.base,
  },
});
