"use client"

import Nav from "@/components/custom/Nav";
import styled from "styled-components";
import {
    Field,
    FieldContent,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
    FieldLegend,
    FieldSeparator,
    FieldSet,
    FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { RippleButton } from "@/components/ui/ripple-button"

import { useForm } from "react-hook-form";
import LoginLeftSide from "./_components/LoginLeftSide";

type FormValues = {
    fullName: string;
    email: string;
    phone: string;
    nic: string;
    password: string;
    confirmPassword: string;
};

const PATTERNS = {
    fullName: /^[A-Za-z][A-Za-z\s.'\-]{1,99}$/,
    email: /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/,
    phone: /^(?:\+94|0)[0-9]{9}$/,         // Sri Lankan: 0712345678 or +94712345678
    nic: /^(?:\d{9}[VvXx]|\d{12})$/,     // Old (9 digits + V/X) or new (12 digits)
    password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#_\-])[A-Za-z\d@$!%*?&#_\-]{8,}$/,
};





export default function Login() {

    const {
        register,
        handleSubmit,
        watch,
        formState: { errors },
    } = useForm<FormValues>({ mode: "onBlur" });

    const onSubmit = (data: FormValues) => console.log(data);


    return <>
        {/* <Nav /> */}

        <div
            data-name="login-container"
            className="flex h-[90vh mt-10"
        >
            <LoginLeftSide />


            <div
                data-name="login-right-side"
                className="h-full p-20 "
            >

                <h1
                    className="text-5xl font-medium "
                >Get start now</h1>

                <p
                    className="text-muted-foreground mt-2 mb-10"
                >
                    Create your account to explore, connect, and grow with ease.
                    We’re excited to have you with us.</p>


                <form onSubmit={handleSubmit(onSubmit)}>
                    <FieldSet>
                        <FieldGroup>

                            <Field>
                                <FieldLabel htmlFor="fullName">Full Name</FieldLabel>
                                <Input
                                    id="fullName"
                                    className="h-10"
                                    autoComplete="off"
                                    placeholder="A.K. Dimath Jayasinghe"
                                    {...register("fullName", {
                                        required: "Full name is required",
                                        pattern: {
                                            value: PATTERNS.fullName,
                                            message: "Letters, spaces, dots, apostrophes and hyphens only (2–100 chars)",
                                        },
                                    })}
                                />
                                {errors.fullName && <p className="text-red-500 text-xs mt-1">{errors.fullName.message}</p>}
                            </Field>

                            <Field>
                                <FieldLabel htmlFor="email">Email</FieldLabel>
                                <Input
                                    id="email"
                                    className="h-10"
                                    type="email"
                                    autoComplete="off"
                                    placeholder="example@gmail.com"
                                    {...register("email", {
                                        required: "Email is required",
                                        pattern: {
                                            value: PATTERNS.email,
                                            message: "Enter a valid email address",
                                        },
                                    })}
                                />
                                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
                            </Field>

                            <Field>
                                <FieldLabel htmlFor="phone">Phone Number</FieldLabel>
                                <Input
                                    id="phone"
                                    type="tel"
                                    className="h-10"
                                    autoComplete="off"
                                    placeholder="0712345678"
                                    {...register("phone", {
                                        required: "Phone number is required",
                                        pattern: {
                                            value: PATTERNS.phone,
                                            message: "Enter a valid Sri Lankan number (e.g. 0712345678 or +94712345678)",
                                        },
                                    })}
                                />
                                {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
                            </Field>

                            <Field>
                                <FieldLabel htmlFor="nic">NIC</FieldLabel>
                                <Input
                                    id="nic"
                                    className="h-10"
                                    autoComplete="off"
                                    placeholder="200123456789"
                                    {...register("nic", {
                                        required: "NIC is required",
                                        pattern: {
                                            value: PATTERNS.nic,
                                            message: "Old NIC: 9 digits + V or X (e.g. 901234567V). New NIC: 12 digits",
                                        },
                                    })}
                                />
                                {errors.nic && <p className="text-red-500 text-xs mt-1">{errors.nic.message}</p>}
                            </Field>

                            <Field>
                                <FieldLabel htmlFor="password">Password</FieldLabel>
                                <Input
                                    id="password"
                                    type="password"
                                    className="h-10"
                                    autoComplete="off"
                                    placeholder="Enter your password"
                                    {...register("password", {
                                        required: "Password is required",
                                        pattern: {
                                            value: PATTERNS.password,
                                            message: "Min 8 chars with uppercase, lowercase, digit, and special character",
                                        },
                                    })}
                                />
                                {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
                            </Field>

                            <Field>
                                <FieldLabel htmlFor="confirmPassword">Confirm Password</FieldLabel>
                                <Input
                                    id="confirmPassword"
                                    autoComplete="off"
                                    className="h-10"
                                    type="password"
                                    placeholder="Re-enter your password"
                                    {...register("confirmPassword", {
                                        required: "Please confirm your password",
                                        validate: (value) =>
                                            value === watch("password") || "Passwords do not match",
                                    })}
                                />
                                {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword.message}</p>}
                            </Field>

                        </FieldGroup>
                    </FieldSet>

                    <button className="w-full mt-10 p-3 pr-5 pl-5   border border-gray-400 rounded-lg cursor-pointer bg-black text-white hover:bg-black hover:text-white">
                        Register
                    </button>
                </form>

                <p className="mt-4 text-sm text-center">If you already have an account <a href="/auth/login" className="
                underline text-blue-600">login</a></p>


            </div>




        </div>
    </>
}