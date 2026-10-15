import React, { useState } from 'react';
import { Button, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../../context/AuthContext';

export default function AuthScreen() {
  const { login } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: '600' }}>Servoshakti Customer</Text>
      <TextInput placeholder="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={{ borderWidth: 1, padding: 10, borderRadius: 6 }} />
      <TextInput placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry style={{ borderWidth: 1, padding: 10, borderRadius: 6 }} />
      {!!error && <Text style={{ color: 'red' }}>{error}</Text>}
      <Button title="Login" onPress={() => login(phone, password).catch((e) => setError(e.message))} />
    </View>
  );
}
