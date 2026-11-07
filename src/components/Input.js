import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { spacing, typography, fontFamily } from '../theme';

// iOS filled text field: theme.input fill, no border, radius 10, 44px tall.
export default function Input({ label, value, onChangeText, placeholder, keyboardType, style, multiline, ...rest }) {
  const { theme } = useTheme();
  return (
    <View style={style}>
      {label && (
        <Text style={[styles.label, { color: theme.textSecondary, fontSize: typography.sizes.sm, fontFamily }]}>
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
            color: theme.text,
            textAlignVertical: multiline ? 'top' : 'center',
            minHeight: multiline ? 80 : 44,
            fontFamily,
          },
          { outlineStyle: 'none' },
        ]}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: spacing[1], fontWeight: '500' },
  input: {
    borderRadius: 10,
    paddingHorizontal: spacing[3],
    paddingVertical: 10,
    fontSize: 17,
  },
});
