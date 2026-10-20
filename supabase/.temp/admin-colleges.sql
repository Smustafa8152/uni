select id, email, role, college_id
from public.users
where role = 'admin'
order by id;
