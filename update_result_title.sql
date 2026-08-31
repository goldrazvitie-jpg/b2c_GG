-- Заменить «вашему запросу» на «твоему запросу» в заголовках результата.
-- Выполнить один раз в Supabase → SQL Editor.
update result_texts
set title = replace(title, 'вашему запросу', 'твоему запросу')
where title like '%вашему запросу%';
