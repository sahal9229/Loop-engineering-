from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.shortcuts import redirect, render


def login_view(request):
    if request.user.is_authenticated:
        return redirect('dashboard')

    error = None

    if request.method == 'POST':
        email = request.POST.get('email', '').strip()
        password = request.POST.get('password', '')

        user = None
        try:
            existing_user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            existing_user = None

        if existing_user is not None:
            user = authenticate(request, username=existing_user.username, password=password)

        if user is not None:
            login(request, user)
            return redirect('dashboard')

        error = 'Invalid email or password'

    return render(request, 'accounts/login.html', {'error': error})


@login_required
def dashboard_view(request):
    return render(request, 'accounts/dashboard.html', {'email': request.user.email})


def logout_view(request):
    logout(request)
    return redirect('login')
