ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read" ON messages
     FOR SELECT USING (true);
